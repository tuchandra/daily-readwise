import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
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

  // We don't care about any of the other fields
  url: string | null;
  source_url: string | null;
  source_type: string;
  category: string | null;
  location_type: string;
  location: number;
  note: string;
  highlighted_at: string;
  highlight_url: string | null;
  image_url: string;
  api_source: string | null;
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

  async getReview(): Promise<ReadwiseReview> {
    const response = await fetch(`https://readwise.io/api/v2/review/`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    const responseJson = await response.json();
    console.log(responseJson);
    return responseJson;
  }

  /**
   * Find the note that contains the given highlight. Return the block-reference link.
   */
  highlightToMarkdown(highlight: ReadwiseHighlight): string | undefined {
    const bookIdsMap = this.getOfficialPluginSettings().booksIDsMap;

    // Find the key/value pair where the value is the highlight.id
    const bookTitle = Object.entries(bookIdsMap).find( ([_key, value]) => value === highlight.id.toString() )?.[0];
    return bookTitle;
  }

  async onload() {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    this.addRibbonIcon(
      'book-open',
      'Review highlights',
      async (_evt: MouseEvent) => {
        new Notice('This is a notice! I hope this changed.');
        await this.getTokenFromOfficialPlugin();
      },
    );

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'add-review-highlights',
      name: 'Add daily review highlights to current note',
      callback: async () => {
        await this.getTokenFromOfficialPlugin();
        const review = await this.getReview();
        const highlights = review.highlights;
        console.log(highlights);
        console.log(highlights.map(this.highlightToMarkdown.bind(this)));
      },
    });

    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: 'open-sample-modal-complex',
      name: 'Open sample modal (complex)',
      checkCallback: (checking: boolean) => {
        // Conditions to check
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          // If checking is true, we're simply "checking" if the command can be run.
          // If checking is false, then we want to actually perform the operation.
          if (!checking) {
            new SampleModal(this.app).open();
          }

          // This command will only show up in Command Palette when the check function returns true
          return true;
        }
      },
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
