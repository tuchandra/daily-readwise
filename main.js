"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
const obsidian = require("obsidian");
function getAuthHeaders(token) {
  return { AUTHORIZATION: `Token ${token}` };
}
async function getDailyReview(token) {
  const response = await fetch("https://readwise.io/api/v2/review/", {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  const review = await response.json();
  return review;
}
async function getHighlightBookId(highlight, token) {
  const response = await fetch(
    `https://readwise.io/api/v2/highlights/${highlight.id}`,
    {
      method: "GET",
      headers: getAuthHeaders(token)
    }
  );
  const highlightDetail = await response.json();
  return { bookId: highlightDetail.book_id };
}
async function getHighlights(token) {
  const review = await getDailyReview(token);
  const highlightDetails = await Promise.all(
    review.highlights.map(async (highlight) => ({
      ...highlight,
      bookId: (await getHighlightBookId(highlight, token)).bookId
    }))
  );
  return highlightDetails;
}
class HighlightModal extends obsidian.FuzzySuggestModal {
  constructor(app, editor, highlights) {
    super(app);
    __publicField(this, "editor");
    __publicField(this, "highlights");
    this.editor = editor;
    this.highlights = highlights;
  }
  getItems() {
    return this.highlights;
  }
  getItemText(item) {
    return item.text;
  }
  onChooseItem(item) {
    new obsidian.Notice(`Selected ${item.title}`);
    this.editor.replaceSelection(
      `From [[${item.title}]].

![[${item.title}#^${item.highlightId}]]

`
    );
  }
  renderSuggestion(match, el) {
    el.createEl("h2", { text: match.item.title });
    obsidian.MarkdownRenderer.render(
      this.app,
      match.item.text,
      el,
      match.item.path,
      new obsidian.Component()
    );
  }
}
class DailyHighlightsPlugin extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", { readwiseAPIToken: "" });
  }
  getOfficialPluginSettings() {
    const plugins = this.app.plugins;
    const settings = plugins.plugins["readwise-official"].settings;
    return settings;
  }
  getToken() {
    if (!this.settings.readwiseAPIToken)
      new obsidian.Notice("No API token found for Readwise");
    return this.settings.readwiseAPIToken;
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
  async getOrSetToken() {
    if (this.settings.readwiseAPIToken)
      return this.settings.readwiseAPIToken;
    const token = this.getOfficialPluginSettings().token;
    this.settings.readwiseAPIToken = token;
    await this.saveSettings();
    new obsidian.Notice("Successfully set Readwise API token");
    return token;
  }
  async findBlock(highlight) {
    var _a;
    const file = this.findFile(highlight);
    const blocks = ((_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.blocks) || {};
    const block = blocks[`rw${highlight.id}`];
    const link = `![[${file.basename}#^${block.id}]]`;
    return { block, file, link, highlight };
  }
  /**
   * Find the file in the vault that corresponds to the _book_ containing a given
   * highlight. This uses the Readwise plugin settings, which already map book titles
   * to book IDs for the usual syncing.
   */
  findFile({ bookId, title }) {
    const { booksIDsMap } = this.getOfficialPluginSettings();
    const bookTitle = Object.keys(booksIDsMap).find(
      (title2) => booksIDsMap[title2] === bookId.toString()
    );
    if (!bookTitle) {
      throw new Error(`No book found for '${title}' with id ${bookId}`);
    }
    const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
    if (maybeFile instanceof obsidian.TFile)
      return maybeFile;
    throw new Error(`No book found for id ${bookId}`);
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "set-readwise-token",
      name: "Set Readwise API token",
      callback: this.getOrSetToken.bind(this)
    });
    this.addCommand({
      id: "add-review-highlights",
      name: "Add daily highlights to current note",
      editorCallback: async (editor) => {
        const token = await this.getOrSetToken();
        const highlights = await getHighlights(token);
        const blocks = await Promise.allSettled(
          highlights.map(this.findBlock.bind(this))
        );
        const highlightsWithLinks = blocks.flatMap(
          (x) => x.status === "fulfilled" ? [x.value] : []
        );
        console.log(blocks, highlightsWithLinks);
        const modalContents = highlightsWithLinks.map((x) => ({
          highlightId: x.block.id,
          text: x.highlight.text,
          path: x.file.path,
          title: x.file.basename
        }));
        new HighlightModal(this.app, editor, modalContents).open();
      }
    });
    this.addSettingTab(new SettingTab(this.app, this));
  }
  onunload() {
  }
  async loadSettings() {
  }
  async saveSettings() {
    await this.saveData(this.settings);
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
      (text) => text.setPlaceholder("n/a").setValue(this.plugin.getToken()).onChange(async (value) => {
        this.plugin.settings.readwiseAPIToken = value;
        await this.plugin.saveSettings();
      })
    );
  }
}
exports.HighlightModal = HighlightModal;
exports.default = DailyHighlightsPlugin;
