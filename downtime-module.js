// downtime-module.js

/**
 * A custom Item subclass for Downtime Activities.
 * This class extends the base Foundry Item and can be customized to
 * add specific data and behavior for downtime activities.
 */
class DowntimeActivity extends Item {
  /**
   * Defines the default data schema for the DowntimeActivity item.
   * This schema will be merged with the system's default item schema.
   * You can add any custom properties here that are relevant to downtime.
   * For example, 'duration', 'cost', 'description', 'outcome'.
   *
   * @returns {object} The default data structure for a DowntimeActivity.
   */
  static defineSchema() {
    // Get the base item schema from the currently active game system.
    // This ensures compatibility with the system's core item data.
    // For a truly system-agnostic approach, we'll define our own data structure
    // and assume the system's 'data' object is where our custom data lives.
    // Foundry v10+ uses 'system' for custom data.
    const schema = super.defineSchema(); // Get the base Item schema

    // Override or add to the 'system' property of the base schema
    schema.system = new foundry.data.fields.SchemaField({
      description: new foundry.data.fields.HTMLField({initial: "", label: "DOWNTIME.Description"}), // A rich text description
      duration: new foundry.data.fields.StringField({initial: "1 day", label: "DOWNTIME.Duration"}), // e.g., "1 day", "1 week"
      cost: new foundry.data.fields.StringField({initial: "0", label: "DOWNTIME.Cost"}), // e.g., "50 credits", "2 supplies"
      isComplete: new foundry.data.fields.BooleanField({initial: false, label: "DOWNTIME.Completed"}), // To track if completed
      // New fields for rolling and outcomes
      rollDie: new foundry.data.fields.StringField({initial: "1d20", label: "DOWNTIME.RollDie"}), // e.g., "1d20", "1d100"
      currentOutcome: new foundry.data.fields.HTMLField({initial: "", label: "DOWNTIME.CurrentOutcome"}), // The outcome from the last roll
      outcomes: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          minRoll: new foundry.data.fields.NumberField({initial: 1, integer: true, min: 0, label: "DOWNTIME.MinRoll"}),
          maxRoll: new foundry.data.fields.NumberField({initial: 20, integer: true, min: 0, label: "DOWNTIME.MaxRoll"}),
          description: new foundry.data.fields.HTMLField({initial: "", label: "DOWNTIME.OutcomeDescription"}),
        }),
        {initial: [{minRoll: 1, maxRoll: 7, description: ""}, {minRoll: 8, maxRoll: 15, description: ""}, {minRoll: 16, maxRoll: 20, description: ""}], label: "DOWNTIME.Outcomes"}
      ),
      // Add any other fields relevant to your downtime mechanics
    });

    return schema;
  }

  /**
   * Extends the base ItemSheet to use our custom template.
   * This ensures that when you open a DowntimeActivity item, it uses
   * the HTML template we define.
   */
  get sheet() {
    return new DowntimeActivitySheet(this, {
      template: `modules/downtime-activities/templates/downtime-activity-sheet.html`
    });
  }

  /**
   * Performs the dice roll for the downtime activity and determines the outcome.
   */
  async rollDowntimeActivity() {
    const rollExpression = this.system.rollDie;
    if (!rollExpression) {
      ui.notifications.warn(game.i18n.localize("DOWNTIME.NoRollDieWarning"));
      return;
    }

    try {
      const roll = await new Roll(rollExpression).evaluate({async: true});
      const rollResult = roll.total;

      let matchedOutcome = null;
      for (const outcome of this.system.outcomes) {
        if (rollResult >= outcome.minRoll && rollResult <= outcome.maxRoll) {
          matchedOutcome = outcome;
          break;
        }
      }

      let outcomeText = game.i18n.localize("DOWNTIME.NoOutcomeFound");
      if (matchedOutcome) {
        outcomeText = matchedOutcome.description;
      }

      // Update the item's currentOutcome field
      await this.update({ "system.currentOutcome": outcomeText });

      // Create a chat message with the roll result and outcome
      const chatContent = `
        <h2>${this.name} - ${game.i18n.localize("DOWNTIME.ActivityRoll")}</h2>
        <p>${game.i18n.localize("DOWNTIME.Rolled")}: <strong>${rollResult}</strong> (${rollExpression})</p>
        <div>${game.i18n.localize("DOWNTIME.Outcome")}: ${outcomeText}</div>
      `;

      ChatMessage.create({
        content: chatContent,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        roll: roll // Attach the roll object for display in chat
      });

      ui.notifications.info(game.i18n.format("DOWNTIME.RollCompleteNotification", {name: this.name, roll: rollResult}));

    } catch (err) {
      console.error("Downtime Activities | Failed to roll downtime activity:", err);
      ui.notifications.error(game.i18n.format("DOWNTIME.RollError", {error: err.message}));
    }
  }

  /**
   * Add any custom methods or logic specific to DowntimeActivity items here.
   * For example, methods to apply outcomes, check prerequisites, etc.
   */
  async performActivity() {
    // Example: Mark as complete and log to chat
    await this.update({ "system.isComplete": true });
    ChatMessage.create({
      content: game.i18n.format("DOWNTIME.ActivityCompletedChat", {name: this.name, outcome: this.system.currentOutcome}),
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    });
    ui.notifications.info(game.i18n.format("DOWNTIME.ActivityCompletedNotification", {name: this.name}));
  }
}

/**
 * The custom sheet class for the DowntimeActivity item.
 * This extends the default ItemSheet and overrides methods to customize its behavior.
 */
class DowntimeActivitySheet extends ItemSheet {
  /**
   * Returns the default options for the sheet.
   * @override
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["downtime-activities", "sheet", "item"],
      template: `modules/downtime-activities/templates/downtime-activity-sheet.html`,
      width: 600, // Increased width to accommodate new fields
      height: 650, // Increased height
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}]
    });
  }

  /**
   * Get the data for the sheet.
   * @override
   */
  getData() {
    const data = super.getData();
    // Ensure item data is available
    data.item = data.item;
    data.system = data.item.system; // Access the custom system data
    return data;
  }

  /**
   * Activate event listeners on the sheet.
   * @override
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Listener for the "Mark Complete" button
    html.find('.downtime-complete-button').click(async ev => {
      ev.preventDefault();
      await this.item.performActivity();
      this.render(true); // Re-render the sheet to show changes
    });

    // Listener for the "Roll Activity" button
    html.find('.downtime-roll-button').click(async ev => {
      ev.preventDefault();
      await this.item.rollDowntimeActivity();
      this.render(true); // Re-render the sheet to show the updated currentOutcome
    });

    // Listener for adding a new outcome breakpoint
    html.find('.add-outcome-button').click(async ev => {
      ev.preventDefault();
      const outcomes = foundry.utils.deepClone(this.item.system.outcomes);
      outcomes.push({minRoll: 1, maxRoll: 20, description: ""}); // Default new outcome
      await this.item.update({"system.outcomes": outcomes});
      this.render(true); // Re-render the sheet
    });

    // Listener for removing an outcome breakpoint
    html.find('.remove-outcome-button').click(async ev => {
      ev.preventDefault();
      const index = parseInt(ev.currentTarget.dataset.index);
      const outcomes = foundry.utils.deepClone(this.item.system.outcomes);
      outcomes.splice(index, 1);
      await this.item.update({"system.outcomes": outcomes});
      this.render(true); // Re-render the sheet
    });
  }
}


// When Foundry is initialized, register our custom item type.
Hooks.once("init", async function() {
  console.log("Downtime Activities | Initializing module...");

  // Register the custom Item class
  CONFIG.Item.documentClasses.downtimeActivity = DowntimeActivity;

  // Register the custom sheet for our DowntimeActivity item
  Items.registerSheet("downtime-activities", DowntimeActivitySheet, {
    types: ["downtimeActivity"],
    makeDefault: true, // Make this the default sheet for 'downtimeActivity' items
    label: "DOWNTIME.SheetLabel" // Localized label
  });

  // Register localization strings (optional, but good practice)
  // game.i18n.localize is used in the JS for messages.
  // The HTML template uses {{localize "KEY"}} directly.

  console.log("Downtime Activities | Module initialized.");
});

// Optional: Add a hook to provide a custom icon for the new item type
Hooks.on("getItemDirectoryFolderIcon", (folder, html) => {
  if (folder.folder?.type === "Item" && folder.folder?.name === game.i18n.localize("DOWNTIME.DowntimeActivitiesFolderName")) {
    // You can set a custom icon here if you have one
    // Example: html.find("i.fa-folder").removeClass("fa-folder").addClass("fa-calendar-alt");
  }
});