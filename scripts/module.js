// Register module initialization hook
Hooks.once("init", () => {
  // Register settings
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Constitution value as base HP, plus (Con mod + half Con value) per level after 1.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Double straight damage and ignore default damage table.",
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

  // Enhance base actor with modified HP and Effort logic
  libWrapper.register("godbound-pa-options",
    "CONFIG.Actor.documentClass.prototype.prepareDerivedData",
    function (wrapped, ...args) {
      wrapped(...args); // Run the original calculation first

      // Check if the actor is a character
      if (this.type !== "character") return;

      const data = this.system;
      const level = data.details?.level?.value ?? 1;

      // Paradoxical Archive HP logic
      if (game.settings.get("godbound-pa-options", "paradoxHp")) {
        const constitutionValue = data.attributes?.con?.value ?? 10; // Default Constitution value
        const constitutionMod = data.attributes?.con?.mod ?? 0;

        // Updated HP calculation: 2 * Constitution value + (Level - 1) * (Con mod + half Con value)
        data.health.max = constitutionValue * 2;
        if (level > 1) {
          data.health.max += (level - 1) * (constitutionMod + Math.ceil(constitutionValue / 2));
        }

        // Optional: Adjust HP value to prevent exceeding max (I would like to kill myself instead :>)
        // data.health.value = Math.min(data.health.value ?? 0, data.health.max);
      }

      // Starting Effort Override logic (only applies at level 1)
      const effortOverride = game.settings.get("godbound-pa-options", "startingEffort");
      if (effortOverride > 0 && level === 1) {
        data.resources.effort.max = effortOverride;

        // Cap current effort to the max defined by the override
        if (data.resources.effort.value > effortOverride) {
          data.resources.effort.value = effortOverride;
        }
      }
    }, "WRAPPER");

  // Modify weapon damage calculations for Paradoxical Archive Damage
  libWrapper.register("godbound-pa-options",
    "CONFIG.Item.documentClass.prototype.prepareDerivedData",
    function (wrapped, ...args) {
      wrapped(...args); // Run the original logic

      // Check if the item is a weapon
      if (this.type !== "weapon") return;

      const isStraightDamage = this.system.straightDamage ?? false;

      if (game.settings.get("godbound-pa-options", "paradoxDamage") && isStraightDamage) {
        this.system.damageDie *= 2; // Double the straight damage die size
        this.system.ignoreDamageTable = true; // Optional: Add a flag to ignore damage tables
      }
    }, "WRAPPER");
});
