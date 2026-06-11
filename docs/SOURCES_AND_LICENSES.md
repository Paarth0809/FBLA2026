# Sources And Licenses

## Code Libraries

| Asset | Use | License/Source |
| --- | --- | --- |
| Express | HTTP server | MIT |
| express-session | Session cookies | MIT |
| bcryptjs | Password hashing | MIT |
| multer | Photo upload parsing | MIT |
| heic-convert | HEIC to JPEG conversion | MIT |
| uuid | IDs | MIT |
| GSAP | Homepage scroll/motion | GreenSock license |
| Three.js | WebGL magnifying glass | MIT |
| Prisma | Database schema/migration path | Apache 2.0 |
| PostgreSQL client `pg` | Postgres access | MIT |
| Tailwind CSS | Generated local utility CSS | MIT |
| Playwright | UI testing | Apache 2.0 |
| axe-core Playwright | Accessibility checks | MPL 2.0 |

## Visual Assets

- `public/images/school.jpg`: Green Level campus image used in the homepage and
  auth pages.
- `public/models/magnifying-glass.glb`: Magnifying glass model used for the
  homepage WebGL lens and search CTA. Model attribution: "Magnifying glass" by
  HQ3DMOD / AivisAstics on Sketchfab.
- `public/textures/photo-studio-01-1k.hdr`: Photo Studio 01-style HDR
  environment map used for reflective GLB lighting. Keep local copy bundled for
  offline demo reliability.
- `public/frames/topaztable/*.webp`: 480-frame local scrollytelling sequence
  generated for the homepage from the project video asset.

## Fonts And Icons

- Inter and Plus Jakarta Sans are vendored locally from Google Fonts.
- Material Symbols Outlined is vendored locally from Google Fonts.

## Presentation Note

If any asset is replaced before final submission, update this file immediately so
the source documentation stays aligned with the judging packet.
