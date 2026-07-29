# shared/

Reserved for cross-stack shared contracts (e.g. TypeScript types generated from or mirroring the C# API models, shared constants/enums) once the frontend and backend need to agree on a shape that's worth generating or hand-syncing rather than duplicating.

Empty for now — the frontend (C#) and backend (TypeScript) don't share a toolchain, so there's nothing concrete to put here yet. Populated as soon as a real need appears (e.g. an OpenAPI spec used to generate both a C# client and TS types).
