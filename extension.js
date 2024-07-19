const vscode = require('vscode');

const { XMLParser } = require('fast-xml-parser');
const { readFileSync } = require('fs');
const { execSync } = require('child_process');

const warningDecoration = vscode.window.createTextEditorDecorationType({
	overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.warningForeground"),
	overviewRulerLane: vscode.OverviewRulerLane.Right,

	textDecoration: 'var(--vscode-editorWarning-foreground) wavy underline 1px'
});

const errorDecoration = vscode.window.createTextEditorDecorationType({
	overviewRulerColor: new vscode.ThemeColor("editorError.foreground"),
	overviewRulerLane: vscode.OverviewRulerLane.Right,
	textDecoration: 'var(--vscode-editorError-foreground) wavy underline 1px'
});

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log("Extension now active");
	const scalastyle = vscode.commands.registerCommand('scalastyle-marker.scalastyle', function () {
		runScalastyle();
	});

	const scalastyleOnSave = vscode.workspace.onDidSaveTextDocument(runScalastyle);
	//const runLint = vscode.workspace.onDidSaveTextDocument(markScalastyleInEditor);
	const runOnOpen = vscode.window.onDidChangeActiveTextEditor(markScalastyleInEditor);

	context.subscriptions.push(scalastyle);
	//context.subscriptions.push(runLint);
	context.subscriptions.push(runOnOpen);
	context.subscriptions.push(scalastyleOnSave);

}

function parseScalastyleXML(fileLocation) {
	const scalastyleXML = readFileSync(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/${fileLocation}`, 'utf-8');
	const parserConfig = {
		ignoreAttributes: false
	}
	const parser = new XMLParser(parserConfig);
	const scalastyleObject = parser.parse(scalastyleXML);

	return scalastyleObject;
}

function markScalastyleInEditor() {
	const config = vscode.workspace.getConfiguration('scalastyle-marker');
	const scalastyleObject = parseScalastyleXML(config.get("scalastyleOutputFile"));

	const files = scalastyleObject['checkstyle']['file']
	console.log(scalastyleObject['checkstyle']['file']);

	// access editor
	const editor = vscode.window.activeTextEditor;

	if (editor) {
		let warningsForFileOpen = null;

		for (let index = 0; index < files.length; index++) {
			const element = files[index];

			if (element['@_name'] === editor.document.fileName.toString()) {
				console.log(element['@_name']);
				warningsForFileOpen = element['error'];
			}
		}

		if (!warningsForFileOpen) {
			console.log("clearing warnings");
			editor.setDecorations(warningDecoration, []);
			editor.setDecorations(errorDecoration, []);
			return;
		}

		// if we have only one warning
		if (!Array.isArray(warningsForFileOpen)) {
			const decoArray = [parseWarningMessage(warningsForFileOpen)];
			if (warningsForFileOpen['@_severity'] === "warning") {
				editor.setDecorations(warningDecoration, decoArray);
			} else {
				editor.setDecorations(errorDecoration, decoArray);
			}
			return;
		}

		// if we have multiple warnings
		const warningArray = [];
		const errorArray = [];
		for (let i = 0; i < warningsForFileOpen.length; i++) {
			const element = warningsForFileOpen[i];
			const warningElement = parseWarningMessage(element);
			if (element['@_severity'] === "warning") {
				warningArray.push(warningElement);
			} else {
				errorArray.push(warningElement);
			}
		}
		editor.setDecorations(warningDecoration, warningArray);
		editor.setDecorations(errorDecoration, errorArray);
	}
}

function parseWarningMessage(errorElement) {
	let line = 0;
	if ('@_line' in errorElement) {
		line = parseInt(errorElement['@_line'])
	}

	let col = 0;
	let colEnd = vscode.window.activeTextEditor.document.lineAt(line - 1).text.length;
	if ('@_column' in errorElement) {
		col = parseInt(errorElement['@_column'])
		colEnd = col + 1;
	}
	console.log(col)

	const msg = errorElement['@_message']

	const startPos = new vscode.Position(line - 1, col);
	const endPos = new vscode.Position(line - 1, colEnd);

	const decoRange = new vscode.Range(startPos, endPos);

	return {range: decoRange, hoverMessage: msg};
}

function runScalastyle() {
	const config = vscode.workspace.getConfiguration('scalastyle-marker');
	const returnCode = execSync(`cd ${vscode.workspace.workspaceFolders[0].uri.fsPath} && ${config.get('scalastyleCommand')}`);
	console.log(Buffer.from(returnCode).toString('utf-8'));
	markScalastyleInEditor();
}

// This method is called when your extension is deactivated
function deactivate() {
	console.log("Extension now inactive");
}

module.exports = {
	activate,
	deactivate
}
