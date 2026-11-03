import { z } from 'zod';

// Configure before schemas are created: even a caught Function() probe violates extension CSP.
z.config({ jitless: true });

export { z };
export { ZodError } from 'zod';
