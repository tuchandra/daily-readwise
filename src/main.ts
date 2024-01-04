import {
  App,
  BlockCache,
  FuzzyMatch,
  FuzzySuggestModal,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';

interface PluginSettings {
  readwiseAPIToken?: string;
}

/**
 * Simplified version of the official Readwise plugin's settings; we need the API token
 * and the book IDs/titles map so that we can integrate with the existing exports.
 */
interface ReadwiseOfficialPluginSettings {
  booksIDsMap: { [key: string]: string };
  token: string;
}

export interface ReadwiseReview {
  review_id: number;
  review_url: string;
  review_completed: boolean;
  highlights: ReadwiseHighlight[];
}

export interface ReadwiseHighlight {
  id: number;
  text: string;
  title: string;
  author: string;
}

export interface ReadwiseHighlightDetail {
  id: number;
  book_id: number;
  text: string;
}

export interface HighlightText {
  id: number;
  book_id: number;
  text: string;
  title: string;
  author: string;
}

export class HighlightModal extends FuzzySuggestModal<HighlightText> {
  highlights: HighlightText[];

  constructor(app: App, highlights: HighlightText[]) {
    super(app);
    this.highlights = highlights;
  }

  getItems(): HighlightText[] {
    return this.highlights;
  }

  getItemText(item: HighlightText): string {
    return item.text;
  }

  onChooseItem(item: HighlightText) {
    new Notice(`Selected ${item.title}`);
  }

  renderSuggestion(item: FuzzyMatch<HighlightText>, el: HTMLElement): void {
    el.createEl('div', { text: item.item.text });
    el.createEl('small', { text: item.item.title });
  }
}

export default class DailyHighlightsPlugin extends Plugin {
  settings: PluginSettings = {};

  getAuthHeaders() {
    return {
      AUTHORIZATION: `Token ${this.settings.readwiseAPIToken}`,
    };
  }

  getOfficialPluginSettings(): ReadwiseOfficialPluginSettings {
    const plugins = this.app.plugins; // property 'plugins' does not exist
    const settings = plugins.plugins['readwise-official'].settings;
    return settings;
  }

  getBlockId({ id }: ReadwiseHighlightDetail): string {
    return `rw${id}`;
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
  async getTokenFromOfficialPlugin(): Promise<void> {
    const apiToken = this.getOfficialPluginSettings().token;
    this.settings.readwiseAPIToken = apiToken;

    await this.saveSettings();
    new Notice('Successfully set Readwise API token');
  }

  async getDailyReview(): Promise<ReadwiseReview> {
    const response = await fetch(`https://readwise.io/api/v2/review/`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    const review: ReadwiseReview = await response.json();
    return review;
  }

  async getHighlightDetail(
    highlight: ReadwiseHighlight,
  ): Promise<ReadwiseHighlightDetail> {
    const response = await fetch(
      `https://readwise.io/api/v2/highlights/${highlight.id}`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      },
    );
    const highlightDetail: ReadwiseHighlightDetail = await response.json();
    return highlightDetail;
  }

  async findBlock(highlight: ReadwiseHighlightDetail): Promise<{
    highlight: ReadwiseHighlightDetail;
    block: BlockCache;
    maybeFile: TFile;
    link: string;
  }> {
    const bookIdsMap = this.getOfficialPluginSettings().booksIDsMap;

    // Find the key/value pair where the value is the highlight.id
    const bookTitle = Object.keys(bookIdsMap).find(
      (title) => bookIdsMap[title] === highlight.book_id.toString(),
    );
    if (!bookTitle)
      throw new Error(`No book found for id ${highlight.book_id}`);

    const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
    if (!(maybeFile instanceof TFile))
      throw new Error(`No book found for id ${highlight.book_id}`);

    // blocks: Record<string, BlockCache>, where keys are block IDs
    const blocks = this.app.metadataCache.getFileCache(maybeFile)?.blocks || {};
    const block = blocks[this.getBlockId(highlight)];

    const link = `![[${maybeFile.basename}#^${block.id}]]`;

    return { highlight, block, maybeFile, link };
  }

  async onload() {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    this.addRibbonIcon(
      'book-open',
      'Review highlights',
      this.getTokenFromOfficialPlugin.bind(this),
    );

    // This adds a simple command
    this.addCommand({
      id: 'add-review-highlights',
      name: 'asdf Add daily review highlights to current note',
      editorCallback: async (editor) => {
        await this.getTokenFromOfficialPlugin();
        const review = await this.getDailyReview();
        const highlightDetails = await Promise.all(
          review.highlights.map(this.getHighlightDetail.bind(this)),
        );
        const blockReferences = await Promise.allSettled(
          highlightDetails.map(this.findBlock.bind(this)),
        );
        blockReferences.map(console.log);

        const links = blockReferences.flatMap((x) =>
          x.status === 'fulfilled' ? [x.value.link] : [],
        );
        editor.replaceSelection(
          `## Highlights (from daily review)\n${links.join('\n')}\n`,
        );

        // new HighlightModal(this.app, highlightDetails).open();
        // console.log(highlightDetails);
        // console.log(highlights);
        // console.log(blockReferences);
      },
    });

    this.addCommand({
      id: 'find-readwise-token',
      name: 'Set the Readwise API token from the official plugin settings',
      callback: this.getTokenFromOfficialPlugin.bind(this),
    });

    this.addCommand({
      id: 'find-readwise-token',
      name: 'Set the Readwise API token from the official plugin settings',
      callback: this.getTokenFromOfficialPlugin.bind(this),
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SettingTab(this.app, this));

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      console.log('click', evt);
    });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    this.registerInterval(
      window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000),
    );
  }

  onunload() {}

  async loadSettings() {}

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SampleModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText('Woah!');
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class SettingTab extends PluginSettingTab {
  plugin: DailyHighlightsPlugin;

  constructor(app: App, plugin: DailyHighlightsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Readwise API token')
      .setDesc(
        'API token from readwise.io. (Requires active Readwise subscription.)',
      )
      .addText((text) =>
        text
          .setPlaceholder('n/a')
          .setValue(this.plugin.settings.readwiseAPIToken!)
          .onChange(async (value) => {
            this.plugin.settings.readwiseAPIToken = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
