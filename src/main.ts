import {
  App,
  BlockCache,
  Editor,
  FuzzyMatch,
  FuzzySuggestModal,
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
  highlights: Highlight[];
}

export interface Highlight {
  id: number;
  text: string;
  title: string;
  author: string;
}

export interface HighlightDetail extends Highlight {
  bookId: number;
}

export interface HighlightModalEntry {
  highlightId: string;
  text: string;
  title: string;
  // author: string;
}

export class HighlightModal extends FuzzySuggestModal<HighlightModalEntry> {
  editor: Editor;
  highlights: HighlightModalEntry[];

  constructor(app: App, editor: Editor, highlights: HighlightModalEntry[]) {
    super(app);
    this.editor = editor;
    this.highlights = highlights;
  }

  getItems(): HighlightModalEntry[] {
    return this.highlights;
  }

  getItemText(item: HighlightModalEntry): string {
    return item.text;
  }

  onChooseItem(item: HighlightModalEntry) {
    new Notice(`Selected ${item.title}`);

    this.editor.replaceSelection(
      `Highlight from [[${item.title}]]\n\n` +
        `![[${item.title}#^${item.highlightId}]]\n`,
    );

    this.highlights.remove(item);
  }

  renderSuggestion(
    match: FuzzyMatch<HighlightModalEntry>,
    el: HTMLElement,
  ): void {
    el.createEl('h2', { text: match.item.title });
    el.createEl('div', { text: match.item.text });
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
    // @ts-ignore; property 'plugins' is undocumented
    const plugins = this.app.plugins;
    const settings = plugins.plugins['readwise-official'].settings;
    return settings;
  }

  getBlockId({ id: highlightId }: HighlightDetail): string {
    return `rw${highlightId}`;
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

  async getHighlightBookId(highlight: Highlight): Promise<{ bookId: number }> {
    const response = await fetch(
      `https://readwise.io/api/v2/highlights/${highlight.id}`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      },
    );
    const highlightDetail = await response.json();
    return { bookId: highlightDetail.book_id };
  }

  async findBlock(highlight: HighlightDetail): Promise<{
    file: TFile;
    block: BlockCache;
    link: string;
    highlight: HighlightDetail;
  }> {
    const bookIdsMap = this.getOfficialPluginSettings().booksIDsMap;

    // Find the key/value pair where the value is the highlight.id
    const bookTitle = Object.keys(bookIdsMap).find(
      (title) => bookIdsMap[title] === highlight.bookId.toString(),
    );
    if (!bookTitle) throw new Error(`No book found for id ${highlight.bookId}`);

    const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
    if (!(maybeFile instanceof TFile))
      throw new Error(`No book found for id ${highlight.bookId}`);

    // blocks: Record<string, BlockCache>, where keys are block IDs
    const blocks = this.app.metadataCache.getFileCache(maybeFile)?.blocks || {};
    const block = blocks[this.getBlockId(highlight)];

    const link = `![[${maybeFile.basename}#^${block.id}]]`;

    return { block, file: maybeFile, link, highlight };
  }

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon(
      'highlighter',
      'Set Readwise API token',
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
          review.highlights.map(async (highlight) => ({
            ...highlight,
            bookId: (await this.getHighlightBookId(highlight)).bookId,
          })),
        );
        const blocks = await Promise.allSettled(
          highlightDetails.map(
            async (highlight) => await this.findBlock(highlight),
          ),
        );

        const highlightsWithLinks = blocks.flatMap((x) =>
          x.status === 'fulfilled' ? [x.value] : [],
        );

        const modalContents = highlightsWithLinks.map((x) => ({
          highlightId: x.block.id,
          text: x.highlight.text,
          title: x.file.basename,
        }));
        new HighlightModal(this.app, editor, modalContents).open();
      },
    });

    this.addCommand({
      id: 'find-readwise-token',
      name: 'Set the Readwise API token from the official plugin settings',
      callback: this.getTokenFromOfficialPlugin.bind(this),
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SettingTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
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
