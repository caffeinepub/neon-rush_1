# Neon Rush - Endless Runner Game

## Current State
New project. No existing code.

## Requested Changes (Diff)

### Add
- Endless 3-lane runner game inspired by Temple Run, with a neon/cyberpunk twist
- Player character runs automatically forward through a neon city corridor
- 3 lanes (left, center, right) -- player changes lanes with arrow keys or A/D or swipe
- Jump (Up/W/SwipeUp) and slide (Down/S/SwipeDown) mechanics
- Procedurally generated obstacles: barriers (jump over), low barriers (slide under), wall blocks (change lane)
- Coins scattered across lanes to collect
- Score increases with distance + coin bonus
- Speed gradually increases over time
- High score leaderboard (backend)
- Game states: Start screen, Playing, Game Over (with score + high score)
- Lives system: 3 hearts, one lost per obstacle hit
- Power-ups: Shield (brief invincibility), Magnet (auto-collect coins), Speed Boost

### Modify
N/A

### Remove
N/A

## Implementation Plan
1. Backend: Motoko canister with leaderboard (submit score, get top 10 scores)
2. Frontend Canvas game using requestAnimationFrame
3. Neon visual style: dark background, glowing lanes, bright neon obstacles and character
4. Touch/swipe support for mobile
5. Sound effects via Web Audio API (optional, low priority)
6. Connect to backend for leaderboard on game over screen
