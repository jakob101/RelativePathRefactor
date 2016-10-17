'use strict';
import * as vscode from 'vscode';

export default class PreviewChangesProvider implements vscode.TextDocumentContentProvider {
    
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _textEdits: { [path: string]: vscode.TextEdit[] };
    private _oldLines: { [path: string]: string[] };

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    public setTextEdits(
        _textEdits: { [path: string]: vscode.TextEdit[] },
        _oldLines: { [path: string]: string[] }) {
        this._textEdits = _textEdits;
        this._oldLines = _oldLines;
    }
    
    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this.createChangesDocument();
    }

    private createChangesDocument() {
        let result = "";

        for (let key in this._textEdits) {
            const relativePath = vscode.workspace.asRelativePath(key);
            result += `<div>${relativePath}</div>`;
            const localEdits = this._textEdits[key];
            localEdits.forEach((edit, index) => {
                result += `<div style="color: red">- ${this._oldLines[key][index]}</div>`;
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