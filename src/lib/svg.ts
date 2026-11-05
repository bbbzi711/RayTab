import { AppError } from '@/lib/errors';
import { Parser } from 'htmlparser2';

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
  const invalid = () => {
    throw new AppError('messages.thisImageCannotBeRead');
  };
  // Chromium can compile event attributes while parsing an inert SVG document.
  // Reject them as data before creating DOM nodes, including duplicate attributes.
  // Reject entity declarations too, so XML expansion cannot introduce new markup.
  new Parser(
    {
      onattribute(name) {
        if (name.split(':').at(-1)?.toLowerCase().startsWith('on')) invalid();
      },
      onprocessinginstruction(name) {
        if (name !== '?xml') invalid();
      },
    },
    { xmlMode: true },
  ).end(text);
  // Keep native XML well-formedness and namespace validation. The preflight does
  // not sanitize or rewrite artwork; accepted images retain their original bytes.
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
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
