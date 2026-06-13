# PLAN.md — Grass Hero v2.3: exact reference palette, black-core bloom, inertia, no clipping
> Planned by Claude (Fable 5) 2026-06-12; implemented by Sonnet subagent.
> Branch: codex/cinematic-grass-hero. Scope: grass hero only (no scroll story/lens/backend).

## Ground truth
User targets: root = black (small radius at bottom), body majority = #032e00
(dark rich green), tips = #b0a234 (yellow-green, top ~third, "not too short").
Reference video samples (ffmpeg, frame 90): tips #bba93a, lit body #a29329,
low blade #696816, dark root #3f4301, crater core #1e261a / #001b00 (near-black
GREEN, dense), crater edge #495d21. Bloom = smaller radius than ours, strong
inertia/delay, center black-green fading out through #032e00 to untouched grass.

## Changes (all in public/js/grass-scene.js unless noted)

1. Vertical blade gradient (exact, distinct bands; author in sRGB, convert to
   linear via pow(c, 2.2) so on-screen ~matches hex after ACES):
   - t 0.00-0.10: #000000 -> #021500 (small black root radius)
   - t 0.10-0.60: #032e00 body (the majority)
   - t 0.60-1.00: blend to #b0a234 tips (yellow visible on top ~third)
   - Per-blade variation: brightness only (x0.8-1.15) + tiny tip hue jitter;
     remove the cool/warm dual-tip mix (hue consistency = premium).
   - REMOVE the warm pool RGB tint (the yellow wash = "game-like"); make the
     pool a neutral brightness multiplier only (edges still darker). Reduce
     the additive backlight term to ~30% of current or remove.
   - Ground shader colors follow the same palette (near-black green).
2. Bloom: uBloomRadius 3.3 -> 2.3. Core goes near-BLACK (#010401 target via
   pressMix up to ~0.96 at center, graded so it passes through #032e00 before
   untouched grass). Remove/de-emphasize the lit ring (<=0.05). Wake trail
   same palette.
3. Inertia: spring stiffness 70 -> 38, damping 13 -> 9; trail fade
   dt*1.4 -> dt*1.0 (longer-lasting delayed wake).
4. Clipping through items (user screenshot shows blades across phone/airpods):
   a) Move desktop items toward camera (less grass in front): airpods
      (-2.1, 3.0), iphone (0.1, 3.6), stanley (2.35, 3.2); shrink maxSize ~10%
      (1.3 / 0.75 / 1.3) since they project larger; re-verify framing+labels.
   b) Strengthen toward-camera corridor: in the clearing loop, the +z shaping
      factor 0.78 -> 0.45; occl smoothstep(0.45, 0.95) -> (0.35, 0.9).
   c) Verify with tight closeups of all three items; zero blades across faces.
5. Performance (stutter): DPR cap desktop 1.6 -> 1.45; top count 56000 ->
   46000; skip trail fade+GPU upload when no cursor activity and field energy
   is ~zero (track a simple decay counter); reuse a temp vector in updateLabel
   instead of clone(). Measure fps ONLY after page.bringToFront() (occluded
   Chromium throttles rAF to 1fps).
6. Verification loop: screenshot our hero, color-pick blade tip/body/root and
   bloom rings with ffmpeg/python, compare to targets above, iterate constants
   until within ~15%. Visual parity with reference frames (/tmp/refv3/f90.png
   exists; extract more with: /opt/homebrew/bin/ffmpeg -i
   ~/Documents/Untitled.mov -vf "select=not(mod(n\,15)),crop=1720:1100:380:120" ...).

## Required checks
node --check public/js/grass-scene.js; git diff --check; npm test (93 pass).
Playwright QA at 1440x1000 + 390x844: item closeups (no clipping), bloom
color gradient + smaller radius, wake delay, labels, reduced motion,
overflow 0, fps steady ~60 desktop. Update CONTEXT.md tail when done.

## Environment notes for implementer
- Repo: /Users/paarthrathod/SOURCE/FBLA2026 (NOT the cwd). Server already on
  http://localhost:3000 (don't restart). Screenshots save to cwd
  (~/Documents/fbla26). GateGuard hook: first Bash + every Edit/Write requires
  stating facts in your reply text, then retrying the same call. Write tool is
  blocked for .html files (none needed). Do NOT commit.
