'use strict';
import * as vscode from 'vscode';

export default class PreviewChangesProvider implements vscode.TextDocumentContentProvider {
    
    private _textEdits: { [path: string]: vscode.TextEdit[] };
    constructor(_textEdits: { [path: string]: vscode.TextEdit[] }) {
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
}