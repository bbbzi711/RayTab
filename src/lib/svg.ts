import { AppError } from '@/lib/errors';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ELEMENTS = new Set(
  'svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask pattern use symbol title desc style filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence'.split(
    ' ',
  ),
);

function hasExternalStyle(value: string) {
  return (
    /[@\\]|(?:https?:|data:|javascript:|\/\/)|image(?:-set)?\s*\(/i.test(value) ||
    [...value.matchAll(/url\(([^)]*)\)/gi)].some(
      ([, reference]) => !/^\s*["']?#[\w:.-]+["']?\s*$/.test(reference),
    )
  );
}

/** Keep vector artwork only when it is a standalone image, without code or remote resources. */
export async function validateSvgImage(image: Blob) {
  const text = await image.text();
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  const invalid = () => {
    throw new AppError('messages.thisImageCannotBeRead');
  };
  if (
    document.doctype ||
    document.createTreeWalker(document, NodeFilter.SHOW_PROCESSING_INSTRUCTION).nextNode() ||
    document.querySelector('parsererror') ||
    root.localName !== 'svg' ||
    root.namespaceURI !== SVG_NAMESPACE
  )
    invalid();
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.namespaceURI !== SVG_NAMESPACE || !ELEMENTS.has(element.localName)) invalid();
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'base' ||
        ((name === 'href' || name === 'src') && !/^#[\w:.-]+$/.test(attribute.value)) ||
        // Namespace declarations contain URLs; they are identifiers, never image dependencies.
        (attribute.namespaceURI !== 'http://www.w3.org/2000/xmlns/' &&
          hasExternalStyle(attribute.value))
      )
        invalid();
    }
    if (element.localName === 'style' && hasExternalStyle(element.textContent ?? '')) invalid();
  }
  return image;
}
