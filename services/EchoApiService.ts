import { requestUrl, RequestUrlParam, Vault, Notice } from 'obsidian';
import { json } from 'stream/consumers';

interface NoteResponse {
    id: string;
    vault_id: string;
    external_id?: string;
    title: string;
    content: string;
    state: 'PENDING' | 'CLAIMED' | 'DELIVERED';
    claim_owner?: string;
    claim_timestamp?: string;
    created_at: string;
    updated_at: string;
}

export interface EchoApiConfig {
    baseUrl: string;
    vaultToken?: string;
}

export class EchoApiService {
    private vault: Vault;
    private saveFolder: string;
    private baseUrl: string;
    private vaultToken?: string;

    constructor(vault: Vault, saveFolder: string, config: EchoApiConfig) {
        this.vault = vault;
        this.saveFolder = saveFolder;
        this.baseUrl = config.baseUrl;
        this.vaultToken = config.vaultToken;
    }

    private async request(
        endpoint: string,
        options: Partial<RequestUrlParam>
    ) {
        const requestParams: RequestUrlParam = {
            url: `${this.baseUrl}${endpoint}`,
            method: 'GET',
            headers: {},
            ...options
        };

        requestParams.headers = {
            ...requestParams.headers,
            'Authorization': `Bearer ${this.vaultToken}`
        };

        return await requestUrl(requestParams);
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.request('/api/notes', { method: 'GET' });
            return true;
        } catch (error) {
            return false;
        }
    }

    public async fetchNewNotes(limit: number = 1000, offset: number = 0): Promise<NoteResponse[]> {
        const queryString = new URLSearchParams({
                state: 'PENDING',
                limit: limit.toString(),
                offset: offset.toString()
        }).toString();
        const response = await this.request(`/api/notes?${queryString}`, {
            method: 'GET',
        });
        if (response.status !== 200) {
            throw new Error(`Obsidian Echo Error: ${response.status}`);
        }
        return response.json;
    }

    public async claimNote(noteId: string, clientId: string): Promise<NoteResponse> {
        const response = await this.request(`/api/notes/${noteId}/claim`, {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (response.status !== 200) {
            throw new Error(`Obsidian Echo cannot claim note error ${noteId}: ${response.status}`);
        }
        return response.json;
    }

    public async downloadNote(noteId: string): Promise<NoteResponse> {
        const response = await this.request(`/api/notes/${noteId}/download`, {
            method: 'GET'
        });
        if (response.status !== 200) {
            throw new Error(`Obsidian Echo cannot download note ${noteId}: ${response.status}`);
        }
        return response.json;
    }

    public async confirmNote(noteId: string): Promise<NoteResponse> {
        const response = await this.request(`/api/notes/${noteId}/confirm`, {
            method: 'POST'
        });
        if (response.status !== 200) {
            throw new Error(`Obsidian Echo cannot confirm note ${noteId}: ${response.status}`);
        }
        return response.json;
    }

    public async createFolderIfNotExists(folder: string): Promise<void> {
        const folderExists = await this.vault.adapter.exists(folder);
        if (!folderExists) {
            await this.vault.createFolder(folder);
        }
    }

    public async syncNewNotes(clientId: string): Promise<void> {
        try {
            await this.createFolderIfNotExists(this.saveFolder);
            // console.log("Fetching new notes");
            const notes = await this.fetchNewNotes();
            for (const note of notes) {
                // Try to claim the note
                // console.log(`Claiming note ${note.id}`);
                await this.claimNote(note.id, clientId);
                // Download the note
                // console.log(`Downloading note ${note.id}`);
                const downloadedNote = await this.downloadNote(note.id);
                // Save the note locally
                const filteredTitle = note.title.replace(/[^a-zA-Zа-яА-Я0-9\s]/g, '');
				// TODO: think about naming for case when name already exists
                const createdDate = new Date(note.created_at);
                const datePrefix = createdDate.toISOString().split('T')[0];
                let fileName = `${this.saveFolder}/${datePrefix} ${filteredTitle}.md`;
                // console.log(`Saving note ${note.id} as ${fileName}`);
                await this.vault.create(fileName, downloadedNote.content);
                // Confirm the delivery
                // console.log(`Confirming note ${note.id}`);
                await this.confirmNote(note.id);
            }
            if (notes.length > 0) {
                new Notice(`Obsidian Echo: ${notes.length} notes synced`);
            }
        } catch (error) {
            console.error("Obsidian Echo sync error:", error);
            throw error;
        }
    }
}
