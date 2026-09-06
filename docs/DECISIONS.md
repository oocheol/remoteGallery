# Decisions

- 2026-09-06: New repository under outputs/gallery-twin; workspace initially empty.
- Use Next/React/R3F with current registry versions verified; avoid unnecessary separate API microservice.
- Local persistent PGlite keeps PostgreSQL semantics without requiring stopped Docker daemon; production adapter may use pg. Embedded DB has exactly one owning process.
- User's HEIC is a dimensioned plan. Promote this particular manually transcribed measured-plan adapter into initial MVP to deliver useful installation geometry. General CAD import remains future.
- No Sol agent available; use Astra for hard 3D/CV tasks, Terra and Luna for specified roles.
- Video-only reconstruction is sparse CPU SfM unless GPU backend configured. Do not mislabel sparse points as a photorealistic twin. No inferred room may be represented as measured.
- Scene world unit meter, artwork dimensions mm, Y up. Plan origin top-left in plan coordinates maps X right/Z down, floor Y=0.
- Venue name/address/source URL were provided by user; online venue photo rights not inferred from a URL. External crawling disabled.

- Actual CPU trial on supplied IMG_3415.mov succeeded: 40/40 selected views registered, 3,722 reconstructed points, 3,567 exported stable points, mean reprojection error 0.478px, 30.5s. This is sparse SfM, not photorealistic GS. Web worker integration is tested separately.
- Local developer app and worker launch together with npm run dev:local; token stored privately, paths absolute, port 3000 fixed. TypeScript 7 requires relative path mapping without removed baseUrl.
- PGlite native transaction callback serializes all queries. Next development server injects x-forwarded-for; local session guard accepts only loopback hops, rejecting remote/cross-site sessions.
- Generic measured-plan uploads are intentionally not presented as automatic parsing. The supplied fixed venue is seeded via scripts/seed-venue.ts; new generic projects offer video/photo capture.
