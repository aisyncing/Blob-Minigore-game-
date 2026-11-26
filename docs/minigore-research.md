# Minigore research brief

Purpose: ground every mechanic in what Minigore and Minigore 2: Zombies
actually did, instead of guessing. Compiled 2026-11-26.

Confidence labels:
- **[Dev]** stated by Mountain Sheep on their own blog (minigore.blogspot.com)
- **[Store]** official App Store listing or patch notes
- **[Review]** a published review
- **[Wiki]** Wikipedia (secondary, cites the dev blog)
- **[Summary]** the fetch tool returned a paraphrase, not verbatim text. Treat as likely, not certain.

## 1. What the games are

- Minigore (iOS, July 30 2009). Developer Mountain Sheep, publisher Chillingo. A
  small-arena survival twin-stick shooter. You play John Gore in "Hardland",
  fighting "furries" for as long as you can and chasing a high score. [Wiki]
- Minigore 2: Zombies (iOS Dec 6 2012, Android Jan 2014). Bigger: melee and
  ranged weapons, levels, bosses, a shop, companions and beasts per character.
  [Dev][Store]
- Team (from blog posts): Kimmo (designer-coder), Timo (art, levels, blog),
  Jussi (business), Tuomas (enemy waves, bosses, coins), Tim (level editor),
  Vlado (shaders). Codebase was "around 30,000 lines" in 2010. No engine is
  named; MG2 uses a "proprietary engine". [Dev]

## 2. Controls and camera

- Two virtual sticks: left moves, right aims and fires. Pushing the right
  stick is what fires; there is no separate fire button on touch. [Review][Wiki]
- Early tuning was about stick size and placement. Kimmo disliked that the
  character "completely stops moving when my thumb slips over the stick's
  area". [Dev, May 26 2009]
- Later: controls use the whole screen, larger play area (Mar 2010). An
  optional auto-aim that "puts John Gore in charge of the guns" (May 2010).
  A bug fix for "fire direction got stuck" (Sep 2010). [Dev]
- MG2 lists "iOS CONTROLLER SUPPORT" (MFi gamepads). MG2 ships with auto-aim
  on by default ("swing and take a shot at the closest threat"); turning it
  off saves ammo. [Store][Review]
- Camera: three-quarter top-down. Boss fights needed "a separate higher
  camera" so boss heads stay in view. Update 8 (Oct 2013) added a top-down
  camera mode. Difficulty select used a zoomed-out camera. [Dev]
- Reviewer complaints: enemies attack "from hidden locations" under the
  thumbs (touch-only problem, gone with a controller). MG2 movement felt like
  a "frustrating snail pace"; a 2016 update added "faster player movement".
  [Review][Store]

## 3. Weapons (Minigore 1)

- Base weapon: machine gun, unlimited ammo, with "kick-back". [Review]
- Shotgun: double-barrelled, limited ammo, dropped from crates; crates
  explode with a "mini explosion" when shot. A later patch gave the shotgun a
  "faster firing rate". One reviewer said the shotgun upgrade "absolutely
  sucks". [Review][Dev]
- Grenade: voted in by players over a "Power Dash" ability. It bounced a few
  times and exploded after a few seconds or on contact. It later became a
  grenade launcher because the thrown grenade "didn't suite the gameplay
  fluently". [Dev]
- Exploding booby trap at launch. Dual-wielding "in any combination you
  like" (Dec 2009), e.g. two shotguns. [Dev][Review]
- Juice added over time: weapon recoil effects for all characters, unique
  muzzle flash per weapon, ejected bullet shells. In co-op, standing close to
  your partner gives bigger flashes and faster fire. [Dev]

## 4. Weapons (Minigore 2)

- Start with a machine gun (limited ammo) plus a rusty axe as melee backup.
  Swords and "super-axes". Guns bought and upgraded in the shop, upgradeable
  to dual versions. Exploding sheep launcher. "Super Shotgun" added in
  Update 3 (Feb 2013). Minigun in a later update. [Review][Dev][Store]
- No source gives shotgun numbers (spread, pellet count, reload). Those must
  be found by tuning.

## 5. Enemies

- Furries come in three sizes that split when shot: Giant Furry, then Furry,
  then Minifurry ("Russian Nesting Dolls with a vengeance"). Tiny ones die in
  one shot. They charge the player in packs. [Dev Summary][Review]
- Flaming Furry: "runs very fast", appears at night, "can outrun even John
  Gore". Giant Flaming Furry spawns flaming furries. [Dev][Review]
- Fur Bomb: "will go totally nuts if you shoot it", chain-reacts with other
  bombs, and kills nearby enemies for extra kills. [Dev]
- Predator Furry "lurks in the bushes". Wormwolf boss jumps constantly, is
  "surprisingly agile", and comes in several sizes. [Dev]
- MG2: 60 enemy types, 7 bosses, up to 150 on screen. Regular and fast
  zombies crawl out of the ground (slower) or get dropped by the "Master of
  Puppets" (faster). Everything else drops from above. [Dev][Store]
- Every MG2 enemy is tuned with the same parameters: speed, turning radius,
  attack radius, size, damage, health. The engine scales models; bigger
  versions get more health and give more points. [Dev, Art of MG2 Part 1 and 4]

## 6. Spawning and difficulty

- MG2 wave system was modelled on Super Stardust HD: spawn patterns
  (circle, line, box) with size, count, location, offset and victory
  conditions. "RANDOM PATTERNS guarantee the fights never feel the same."
  [Dev][Store]
- Minigore 1: no traditional progression, "the longer you survive, the
  harder it gets". Difficulty levels Expert, Insane, later Inferno. Totems you
  shoot at the start to pick difficulty. Dynamic difficulty was removed
  because it complicated multiplayer. [Dev][Review]
- Reviewer complaint: Normal was "WAY too slow" and "never really ramps up
  enough to be overwhelming". [Review]

## 7. Power-up: clovers and the beast

- A clover appears at random after a number of kills. Three clovers turn the
  hero into a beast (a minotaur in MG1, Monster Jerry in MG2) for about
  15-20 seconds: invincible, stomps enemies, double kills, banjo music.
  Clover combos extend it. [Wiki][Dev][Review]
- Danger: changing back while surrounded is often fatal ("two bites from an
  enemy and you're dead"). [Review]
- Reviewers called the beast the main source of variety. [Review]

## 8. Health, scoring, meta

- MG1: one hit knocks John's hat off and makes him angry; the second hit
  kills. Three lives. Later: hearts (up to five) in the top-left. [Dev][Wiki]
- Score became "kills"; bigger enemies give more kills; multipliers added in
  Oct 2010. Kills were also the currency for unlocking characters (some need
  100, one needs a million). [Dev][Review]
- MG2: coins drop from enemies ("mainly inspired by Blizzard's classic PC
  game Diablo"), spent in the Merchant's Wagon on weapons, upgrades, extra
  life, speed. 300 challenges drive progression. [Dev][Store][Review]
- "Furry Sense" radar showing ammo and clovers. [Dev]

## 9. Art, animation, audio

- Storybook look, blocky "cubic" characters, hand-painted level textures
  (timelapse posted by Timo, Mar 2010). [Dev][Review]
- MG2 pipeline [Dev, Art of MG2 Part 1]:
  1. Concept on paper or Photoshop.
  2. Model and UV-map in 3ds Max.
  3. Paint textures in Photoshop.
  4. Hand-animate only walking and attacking. "Game engine's own procedural
     animation is used for death, idle and damage reactions."
  5. Export, set gameplay parameters.
  6. "Everything is then iterated until it feels good in terms of gameplay
     and personality. This part often takes the longest time!"
- Moose: ears and horns are separate objects so they move on their own. [Dev]
- MG2 "CINEMATIC LIGHTING"; a 2016 update added dynamic lighting. [Store]
- Blood "SUPER" shader by Vlado. Reviewer complaint for MG2: "too much
  gory chaos = poor visibility" and you "lose sight of your hero". [Dev][Review]
- Audio: orchestral soundtrack with a "Monkey Island atmosphere" [Dev
  Summary], banjo for beast mode, lots of random one-liners voiced by
  Egoraptor. [Dev][Wiki]

## 10. What critics praised and what they hated

Praised: controls "work beautifully", presentation "top class", charm,
humour, art style, satisfying splatter, "carrot-on-a-stick" unlocks.

Hated (our checklist of things not to repeat):
1. Shallow and repetitive: one map, few weapons, few enemy types.
2. Cheap deaths from enemies you could not see.
3. Slow movement in MG2.
4. Too slow to ramp up on Normal.
5. Visual chaos hiding the hero.

## 11. Gaps and unverified claims

- Could not read: GameClub's two development stories (site unreachable),
  AppSpy and TouchArcade reviews (blocked), the Internet Archive (blocked).
  Jan-Feb 2010 blog posts were not read.
- No source gives numbers for move speed, fire rate, spread or ammo. These
  will be found by tuning, not copied.
- The earlier pasted notes mentioned a "Minigore 2 Art Blog" with poly
  budgets (300-800 tris), 5-8 bone rigs and baked lighting. I found no such
  source. The real art posts confirm painted textures and procedural
  death/idle/hit animation, nothing about poly or bone counts.
- I cannot watch videos. Screenshots or short clips from you would fill the
  biggest gap: exact motion and timing.

## Sources

- https://en.wikipedia.org/wiki/Minigore
- http://minigore.blogspot.com/2009, /2010, /2011, /2012, /2013 (developer blog)
- https://apps.apple.com/app/id576939960 (MG2 App Store listing, version history)
- https://www.videogamer.com/reviews/minigore-review
- https://www.gamezebo.com/reviews/minigore-review/
- https://techcrunch.com/2009/08/04/quick-review-much-hyped-minigore-justifies-its-1-price-tag-but-not-much-more/
- https://www.pocketgamer.com/minigore/minigore-out-now-on-iphone
- https://www.pocketgamer.com/minigore-2-zombies/review/
- https://www.theaureview.com/games/videau-games-mobile-review-minigore-2-zombies-mountain-sheep-2014/
- https://www.metacritic.com/game/minigore-2--zombies/
