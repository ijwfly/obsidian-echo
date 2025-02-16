import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { EchoApiService } from './services/EchoApiService';

interface EchoPluginSettings {
	apiUrl: string;
	vaultToken: string;
	saveFolder: string;
}

const DEFAULT_SETTINGS: EchoPluginSettings = {
	apiUrl: 'https://echo.yourhost.com',
	vaultToken: '',
	saveFolder: 'Echo',
}

export default class EchoPlugin extends Plugin {
	settings: EchoPluginSettings;
	apiService: EchoApiService;
	statusBarItemEl: HTMLElement

	async syncNotes() {
		try {
			this.statusBarItemEl.setText('Echo: syncing...');
			await this.apiService.syncNewNotes("obsidian_client");
			this.statusBarItemEl.setText('');
		} catch (error) {
			new Notice('Obsidian Echo: Error syncing notes');
		}
	}

	async onload() {
		await this.loadSettings();

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText('');

		this.apiService = new EchoApiService(
			this.app.vault,
			this.settings.saveFolder,
			{
				baseUrl: this.settings.apiUrl,
				vaultToken: this.settings.vaultToken,
			}
		);

		this.addCommand({
			id: 'echo-synchronize',
			name: 'Echo Synchronize now',
			callback: async () => {
				await this.syncNotes();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EchoSettingsTab(this.app, this));

		// run sync once after init (after delay)
		setTimeout(() => this.syncNotes(), 1000);

		// run sync every 10 minutes
		this.registerInterval(window.setInterval(() => this.syncNotes(), 10 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class EchoSettingsTab extends PluginSettingTab {
	plugin: EchoPlugin;

	constructor(app: App, plugin: EchoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Save Folder')
			.setDesc('The folder to store downloaded notes')
			.addText(text => text
				.setPlaceholder('Echo')
				.setValue(this.plugin.settings.saveFolder)
				.onChange(async (value) => {
					this.plugin.settings.saveFolder = value;
					await this.plugin.saveSettings();
					this.plugin.apiService = new EchoApiService(
						this.plugin.app.vault,
						this.plugin.settings.saveFolder,
						{
							baseUrl: value,
							vaultToken: this.plugin.settings.vaultToken,
						}
					);
				}));

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('The URL of your Echo API server')
			.addText(text => text
				.setPlaceholder('https://echo.yourhost.com')
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
					this.plugin.apiService = new EchoApiService(
						this.plugin.app.vault,
						this.plugin.settings.saveFolder,
						{
							baseUrl: value,
							vaultToken: this.plugin.settings.vaultToken,
						}
					);
				}));

		new Setting(containerEl)
			.setName('Vault Token')
			.setDesc('Your Echo API vault token')
			.addText(text => text
				.setPlaceholder('Enter your vault token')
				.setValue(this.plugin.settings.vaultToken)
				.onChange(async (value) => {
					this.plugin.settings.vaultToken = value;
					await this.plugin.saveSettings();
					this.plugin.apiService = new EchoApiService(
						this.plugin.app.vault,
						this.plugin.settings.saveFolder,
						{
							baseUrl: value,
							vaultToken: this.plugin.settings.vaultToken,
						}
					);
				}));
	}
}
