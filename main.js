"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
const obsidian = require("obsidian");
class DailyHighlightsPlugin extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", {});
  }
  getAuthHeaders() {
    return {
      AUTHORIZATION: `Token ${this.settings.readwiseAPIToken}`
    };
  }
  getOfficialPluginSettings() {
    const plugins = this.app.plugins;
    const settings = plugins.plugins["readwise-official"].settings;
    return settings;
  }
  /**
   * If there's no token set, add a command to read it from the _official_ Readwise plugin settings.
   * (Assume that it's installed and enabled, I suppose.)
   *
   * Accessing the data from another plugin is questionable. I don't think it's explicitly
   * forbidden, but I also don't think it's intended. (The type definition for `this.app`
   * does not include `plugins`, so it's at minimum undocumented.)
   *
   * This is primarily for my own use, and it's gated behind a command the user has to choose,
   * though, so I'm not too worried about it.
   */
  async getTokenFromOfficialPlugin() {
    const apiToken = this.getOfficialPluginSettings().token;
    this.settings.readwiseAPIToken = apiToken;
    await this.saveSettings();
    new obsidian.Notice("Successfully set Readwise API token");
  }
  async getReview() {
    const response = await fetch(`https://readwise.io/api/v2/review/`, {
      method: "GET",
      headers: this.getAuthHeaders()
    });
    const responseJson = await response.json();
    console.log(responseJson);
    return responseJson;
  }
  /**
   * Find the note that contains the given highlight. Return the block-reference link.
   */
  highlightToMarkdown(highlight) {
    var _a;
    const bookIdsMap = this.getOfficialPluginSettings().booksIDsMap;
    const bookTitle = (_a = Object.entries(bookIdsMap).find(([_key, value]) => value === highlight.id.toString())) == null ? void 0 : _a[0];
    return bookTitle;
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon(
      "book-open",
      "Review highlights",
      async (_evt) => {
        new obsidian.Notice("This is a notice! I hope this changed.");
        await this.getTokenFromOfficialPlugin();
      }
    );
    this.addCommand({
      id: "add-review-highlights",
      name: "Add daily review highlights to current note",
      callback: async () => {
        await this.getTokenFromOfficialPlugin();
        const review = await this.getReview();
        const highlights = review.highlights;
        console.log(highlights);
        console.log(highlights.map(this.highlightToMarkdown.bind(this)));
      }
    });
    this.addCommand({
      id: "open-sample-modal-complex",
      name: "Open sample modal (complex)",
      checkCallback: (checking) => {
        const markdownView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (markdownView) {
          if (!checking) {
            new SampleModal(this.app).open();
          }
          return true;
        }
      }
    });
    this.addCommand({
      id: "find-readwise-token",
      name: "Set the Readwise API token from the official plugin settings",
      callback: this.getTokenFromOfficialPlugin.bind(this)
    });
    this.addSettingTab(new SettingTab(this.app, this));
    this.registerDomEvent(document, "click", (evt) => {
      console.log("click", evt);
    });
    this.registerInterval(
      window.setInterval(() => console.log("setInterval"), 5 * 60 * 1e3)
    );
  }
  onunload() {
  }
  async loadSettings() {
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
class SampleModal extends obsidian.Modal {
  constructor(app) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.setText("Woah!");
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
class SettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setName("Readwise API token").setDesc(
      "API token from readwise.io. (Requires active Readwise subscription.)"
    ).addText(
      (text) => text.setPlaceholder("n/a").setValue(this.plugin.settings.readwiseAPIToken).onChange(async (value) => {
        this.plugin.settings.readwiseAPIToken = value;
        await this.plugin.saveSettings();
      })
    );
  }
}
exports.default = DailyHighlightsPlugin;
