Hooks.once("init", () => {
  // Register settings (same)
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Constitution score as base HP, plus (half Con score + Con mod) per level after 1.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Remove damage table for normal rolls; double total for straight damage.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("godbound-pa-options", "startingEffort", {
    name: "Starting Effort Override",
    hint: "Set custom Effort at level 1 (0 = no override).",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 20, step: 1 }
  });
});

// Use ready for damage wrapper, as classes are loaded
Hooks.once("ready", () => {
  // Grab the GBDamageRoll class from the system's helpers (adjust if not exposed this way)
  const GBDamageRoll = game.system.template.Actor.types.character.helpers?.GBDamageRoll || window.GBDamageRoll; // Test in console if needed
  if (GBDamageRoll) {
    libWrapper.register("godbound-pa-options", "GBDamageRoll.prototype.render", async function (wrapped, options) {
      if (!game.settings.get("godbound-pa-options", "paradoxDamage")) return wrapped(options);

      if (!this._evaluated) await this.evaluate({ allowInteractive: !options.isPrivate });

      let chatData = {
        formula: options.isPrivate ? '???' : this._formula,
        flavor: options.isPrivate ? null : options.flavor ?? this.options.flavor,
        user: game.user.id,
        tooltip: options.isPrivate ? '' : await this.getTooltip(),
        total: options.isPrivate ? '?' : this.total,
        convertedDamage: false, // Always false for paradox mode (no table)
        damage: options.isPrivate ? '?' : this.total // Start with raw total
      };

      // For straight, double the damage
      if (this.options.straightDamage) {
        chatData.damage *= 2;
        chatData.total *= 2; // Update total too if template uses it
      }

      return renderTemplate(options.template ?? this.constructor.CHAT_TEMPLATE, chatData);
    }, "WRAPPER");
  } else {
    console.warn("godbound-pa-options: Could not find GBDamageRoll class for damage wrapper.");
  }
});

libWrapper.register("godbound-pa-options", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", function (wrapped, ...args) {
  wrapped(...args); // Run original

  if (this.type !== "character") return;

  const data = this.system;
  const level = data.details.level.value ?? 1;

  // Paradoxical Archive HP
  if (game.settings.get("godbound-pa-options", "paradoxHp")) {
    const conValue = data.attributes?.con?.value ?? 8;
    const conMod = data.attributes?.con?.mod ?? 0;
    let newMaxHp = 2 * conValue;
    if (level > 1) {
      newMaxHp += (level - 1) * (Math.floor(conValue / 2) + conMod);
    }
    data.health.max = newMaxHp;
    // Clamp current HP
    data.health.value = Math.min(data.health.value, newMaxHp);
  }

  // Starting Effort Override (only at level 1)
  const effortOverride = game.settings.get("godbound-pa-options", "startingEffort");
  if (effortOverride > 0 && level === 1) {
    data.resources.effort.max = effortOverride;
    data.resources.effort.value = Math.min(data.resources.effort.value, effortOverride);
  }
}, "WRAPPER");
