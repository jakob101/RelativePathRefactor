'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from "path";
import * as fs from "fs";
import PreviewChangesProvider from "./previewChangesProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    let relativePathRefactor = new RelativePathRefactor();

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.relativepathrefactor', (uri: vscode.Uri) => {
        // The code you place here will be executed every time your command is executed
        relativePathRefactor.relativePathRefactor(uri);
    });

    context.subscriptions.push(relativePathRefactor);
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

const RELATIVE_PATH_REGEX: RegExp = /[\"|\']([\.].*?)[\"|\']/i;
//const IMPORT_REGEX: RegExp = /import(.*)from[ ]+[\"|\'](.*)[\"|\']\;/i;

class RelativePathRefactor {

    private _workspaceEdits: { [path: string]: vscode.WorkspaceEdit };
    private _textEdits: { [path: string]: vscode.TextEdit[] };
    private _oldLines: { [path: string]: string[] };
    private _previewUri = vscode.Uri.parse('changes-preview://authority/changes-preview');
    private _previewProvider: PreviewChangesProvider;

    constructor() {        
        // initialize preview
        this._previewProvider = new PreviewChangesProvider();
        vscode.workspace.registerTextDocumentContentProvider('changes-preview', this._previewProvider);
    }

    public relativePathRefactor(uri: vscode.Uri) {
        this._workspaceEdits = {};
        this._textEdits = {};
        this._oldLines = {};

        const isFolder = fs.lstatSync(uri.fsPath).isDirectory();
        if (!isFolder) {
            this._textEdits[uri.path] = [];
            this._oldLines[uri.path] = [];
            vscode.workspace.openTextDocument(uri).then(document => {
                if (!document) {
                    vscode.window.showWarningMessage("Failed when opening the file. Make sure it's a text document.");
                    return;
                }

                this.parseFile(document).then(() => this.createPreview());
            });
            
            return;
        }

        // it is a folder
        const folderPath = vscode.workspace.asRelativePath(uri);
        const pattern = `${folderPath}/**/*.*`;
        const findFilesPromise = vscode.workspace.findFiles(pattern, '**∕node_modules∕**', 0);

        findFilesPromise.then(files => {
            if (files.length > 200) {
                vscode.window.showWarningMessage("There is more than 200 files found. Are you sure you want to continue?", "Yes", "No, stop!").then((response) => {
                    if (response !== "Yes") {
                        return;
                    }

                    this.parseFilesInChunks(files);
                });
            } else {
                this.parseFilesInChunks(files);
            }
        });
    }

    private parseFilesInChunks(files: vscode.Uri[]) {
        vscode.window.showInformationMessage(`Parsing ${files.length} files. Please wait...`);
        const chunkSize: number = 20;
        const arrayHoldingSplitArrays: vscode.Uri[][] = [];
        let i: number = 0;
        let j: number = files.length;
        let bigArrayIndex: number = 0;

        for (i = 0; i<j; i += chunkSize) {
            arrayHoldingSplitArrays[bigArrayIndex++] = files.slice(i, i+chunkSize);
        }

        this.parseAllFilesPromiseResolver(arrayHoldingSplitArrays, 0);
    }

    private parseAllFilesPromiseResolver(files: vscode.Uri[][], index: number) {
        const promise = this.parseAllFiles(files[index++]);
        Promise.resolve(promise).then(() => {
            if (index === files.length) {
                this.createPreview();
                vscode.window.showInformationMessage(`Successfully parsed files. Please review the output.`);
                
                // We're done!
                return;
            }

            return this.parseAllFilesPromiseResolver(files, index);
        });
    }

    private parseAllFiles(files: vscode.Uri[]) {
        const filePromises = files.map(file => {
            this._textEdits[file.path] = [];
            this._oldLines[file.path] = [];
            return vscode.workspace.openTextDocument(file).then(document => {
                if (!document) {
                    return;
                }

                return this.parseFile(document);
            });
        });

        return Promise.all(filePromises);
    }

    private parseFile(document: vscode.TextDocument) {
        let lines: vscode.TextLine[] = [];
        if (document.lineCount > 0) {
            for (var index = 0; index < document.lineCount; index++) {
                lines.push(document.lineAt(index));
            }
        }

        const linePromises = lines.map(line => {
            return this.parseLine(line, document);
        });

        return Promise.all(linePromises).then(() => {
            vscode.window.setStatusBarMessage(`Parsed ${document.fileName}`, 1000);
            this._workspaceEdits[document.uri.path] = new vscode.WorkspaceEdit();
            this._workspaceEdits[document.uri.path].set(document.uri, this._textEdits[document.uri.path]);
            vscode.workspace.applyEdit(this._workspaceEdits[document.uri.path]);
            document.save();
        });
    }

    private parseLine(line: vscode.TextLine, document: vscode.TextDocument) {
        const lineContents = line.text.trim();
        const match = lineContents.match(RELATIVE_PATH_REGEX);

        if (!match || match.length > 2) {
            return;
        }

        // Get file name
        const fileName = path.basename(match[1]);
        const extension = path.extname(fileName);
        const pattern = extension === '' ? `**/${fileName}.*` : `**/${fileName}`;
        const findFilePromise = vscode.workspace.findFiles(pattern, '**∕node_modules∕**', 2);
        
        return findFilePromise.then(files => {
            // ignore ambiguous results
            if (files.length !== 1) {
                return null;
            }

            // find relative path
            const targetPath = files[0].fsPath;
            const currentPath = document.uri.fsPath;
            let relativePath = path.relative(currentPath, targetPath).replace(".", "").replace(/\\/g, "/");
            
            if (!relativePath) {
                return;
            }

            // remove extension
            relativePath = relativePath.substring(0, relativePath.lastIndexOf("."));

            // remove leading dot
            if (relativePath.startsWith("./../")) {
                relativePath = relativePath.substring(2, relativePath.length);
            }

            // if nothing changed
            if (relativePath + extension === match[1]) {
                return;
            }

            //Replace last part of regex with relative path
            const textEdit = new vscode.TextEdit(line.range, line.text.replace(RELATIVE_PATH_REGEX, `\"${relativePath}${extension}\"`));
            this._textEdits[document.uri.path].push(textEdit);
            this._oldLines[document.uri.path].push(line.text);
        });
    }

    private createPreview() {
        this._previewProvider.setTextEdits(this._textEdits, this._oldLines);
        this._previewProvider.update(this._previewUri);
        vscode.commands.executeCommand('vscode.previewHtml', this._previewUri, vscode.ViewColumn.Two, 'Review Changes');
    }

    dispose() {
        this._workspaceEdits = null;
        this._textEdits = null;
        this._oldLines = null;
    }
}