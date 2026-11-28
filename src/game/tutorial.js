// The first-run lesson: step 1 "move" (left stick), a short breather, step 2 "shoot" (R2). Pure: it only tracks which step
// the player is on and what game speed that step wants. main.js decides what to hold back (waves) and the view draws the prompt.
//
//   off -> move -> gap -> shoot -> done          (only ever forward; cancel() goes back to off unless the lesson is done)
//
// Time passed to update() is REAL time, so easing and the stick hold are unaffected by the slow motion this module asks for.
import { RULES } from './rules.js';

export function createTutorial(cfg = RULES.tutorial) {
  const st = { stage: 'off', hold: 0, gapT: 0, scale: 1 };
  const target = () => (st.stage === 'move' || st.stage === 'shoot' ? cfg.slow : 1);
  return {
    state: st,
    /** true while the lesson is up (waves must wait) */
    get active() { return st.stage === 'move' || st.stage === 'gap' || st.stage === 'shoot'; },
    get done() { return st.stage === 'done'; },
    /** game speed multiplier for this frame; exactly 1 whenever the lesson is not asking for slow motion */
    get timeScale() { return st.scale; },
    /** start the lesson (does nothing once it has been completed) */
    begin() { if (st.stage !== 'off') return; st.stage = 'move'; st.hold = 0; st.gapT = 0; st.scale = cfg.slow; },
    /** abandon an unfinished lesson (menu, practice mode, restart): normal speed at once, and next begin() starts from step 1 */
    cancel() { if (st.stage !== 'done') st.stage = 'off'; st.hold = 0; st.gapT = 0; st.scale = 1; },
    skip() { st.stage = 'done'; st.scale = 1; },
    /** call once per frame with real seconds, the shaped left-stick magnitude, and whether a pull of the trigger would fire */
    update(realDt, { moveMag = 0, gunReady = true } = {}) {
      if (st.stage === 'move') {
        st.hold = moveMag >= cfg.moveMag ? st.hold + realDt : 0;
        if (st.hold >= cfg.moveHold) { st.stage = 'gap'; st.gapT = 0; st.hold = 0; }
      } else if (st.stage === 'gap') {
        st.gapT += realDt;
        if (st.gapT >= cfg.gap && gunReady) st.stage = 'shoot';
      }
      const want = target(), rate = (1 - cfg.slow) / cfg.ease * realDt;
      st.scale = Math.abs(st.scale - want) <= rate ? want : st.scale + Math.sign(want - st.scale) * rate;
    },
    /** the gun reports every shot it really fires; the one that arrives during step 2 completes the lesson */
    onShot() { if (st.stage === 'shoot') st.stage = 'done'; },
  };
}
