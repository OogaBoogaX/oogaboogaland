// Deterministic Zuzu decisions. Only frozen observations and validated requests cross this boundary.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const HELLO = ["There you are. My staff meeting can begin.", "I saved you a spot. Not my spot.", "Welcome. Try to look supervised.", "You may admire me. Quietly.", "I was doing nothing. Expertly."];
  const FOOD = ["Is that lunch, or are you just carrying my lunch?", "I see snacks. Our friendship has potential.", "I'll walk with you. This is a food inspection.", "You chew. I judge. A balanced partnership."];
  const CHAT = ["I'm not ignoring you. I'm considering it.", "I run this place. The turtle handles transport.", "My schedule is full. Nap, snack, disapprove.", "You can sit here. I haven't decided if you can stay.", "Patience is my gift. Dinner is yours to arrange."];
  const TOMATO = ["A tomato? I ordered room service, not salad weather.", "Again? Your catering licence is revoked.", "I am keeping receipts. Tiny, furious receipts."];
  const SHOTS = ["Absolutely not. Indoor voice. Outdoor everything.", "I'm a cat, not target practice. Meeting adjourned.", "That is not how you open a tin."];
  let visits = 0;
  const create = () => {
    let id = 0, cursor = visits++ % HELLO.length, greetAt = Infinity, nextInterest = 0, nextIdle = 8, pendingLine = "", retryAt = 0, closed = false;
    const pick = (pool) => pool[cursor++ % pool.length];
    const observe = (p, event, submit) => {
      if (closed || !p.active) return;
      const ask = (type, args = {}) => submit({ visit: p.visit, id: ++id, at: p.time, type, ...args });
      const say = text => ask("say", { text });
      if (event === "tomato_hit" || event === "weapon_hit" || event === "shot_nearby") {
        ask("flee");
        const line = event === "tomato_hit" ? TOMATO[Math.min(2, p.self.tomatoHits - 1)] : pick(SHOTS);
        pendingLine = say(line) === "accepted" ? "" : line; retryAt = p.time + 3; greetAt = Infinity;
        nextInterest = p.time + 18; return;
      }
      if (pendingLine && event === "tick" && p.time >= retryAt) { if (say(pendingLine) === "accepted") pendingLine = ""; retryAt = p.time + 3; }
      if (p.self.intent === "flee") return;
      if (event === "player_seen") { ask("look_at", { entity: "player" }); greetAt = p.time + 1.5; }
      if (event === "talk") {
        ask("look_at", { entity: "player" });
        say(p.self.tomatoHits ? "Yes, I remember the tomato. No, we are not even." : p.player.food || p.self.foodInterest > 0.5 ? pick(FOOD) : pick(CHAT));
        greetAt = Infinity;
      }
      if ((event === "food_seen" || event === "food_activity") && p.time >= nextInterest) {
        ask("look_at", { entity: "player" }); ask("approach", { entity: "player" });
        say(pick(FOOD)); nextInterest = p.time + 12; greetAt = Infinity;
      }
      if (event === "tick") {
        if (p.near && p.time >= greetAt) { if (say(pick(HELLO)) === "accepted") greetAt = Infinity; }
        if (p.near && p.self.foodInterest > 0.5 && p.time >= nextInterest && p.self.intent !== "follow") { ask("follow_player"); nextInterest = p.time + 32; }
        if (p.time >= nextIdle && (p.self.intent === "sit" || p.self.intent === "idle" || p.self.intent === "look_at_player")) {
          ask("gesture", { name: cursor++ % 3 === 0 ? "stretch" : "tail_flick" }); nextIdle = p.time + 11;
        }
      }
    };
    return { observe, dispose: () => { closed = true; } };
  };
  BL.dsbAgentBrain = { create };
})();
