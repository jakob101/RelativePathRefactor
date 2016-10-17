'use strict';
import * as vscode from 'vscode';

export default class PreviewChangesProvider implements vscode.TextDocumentContentProvider {
    
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _textEdits: { [path: string]: vscode.TextEdit[] };

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    public setTextEdits(_textEdits: { [path: string]: vscode.TextEdit[] }) {
        this._textEdits = _textEdits;
    }
    
    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this.createChangesDocument(this._textEdits);
    }

    private createChangesDocument(edits: { [path: string]: vscode.TextEdit[] }) {
        let result = "";

        for (let key in edits) {
            const relativePath = vscode.workspace.asRelativePath(key);
            result += `<div>${relativePath}</div>`;
            const localEdits = edits[key];
            localEdits.forEach(edit => {
                result += `<div style="color: green">+ ${edit.newText}</div>`;
            });
            result += "<br />";
        }
        
        return result;
    }

    dispose() {
        this._textEdits = {};
    }
}