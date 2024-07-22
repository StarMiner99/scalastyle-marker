const vscode = require('vscode');

const { XMLParser } = require('fast-xml-parser');
const { readFileSync } = require('fs');
const { execSync } = require('child_process');

const diagnosticCollection = vscode.languages.createDiagnosticCollection("scalastyle")

/**
 * runs on extension activation
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log("Extension now active, running scalastyle once...");
	runScalastyle();
	const scalastyle = vscode.commands.registerCommand('scalastyle-marker.scalastyle', function () {
		runScalastyle();
	});

	const scalastyleOnSave = vscode.workspace.onDidSaveTextDocument(runScalastyle);
	const runOnOpen = vscode.window.onDidChangeActiveTextEditor(function() {
		if (vscode.window.activeTextEditor) markScalastyleInEditor();
	});

	context.subscriptions.push(scalastyle);
	context.subscriptions.push(runOnOpen);
	context.subscriptions.push(scalastyleOnSave);

}

/**
 * parses the checkstyle xml file and returns it as an js object
 * @param {string} fileLocation
 * @returns {Object}
 */
function parseScalastyleXML(fileLocation) {
	const scalastyleXML = readFileSync(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/${fileLocation}`, 'utf-8');
	const alwaysArray = [
		"checkstyle.file",
		"checkstyle.file.error"
	]
	const parserConfig = {
		ignoreAttributes: false,
		ignoreDeclaration: true,
		// eslint-disable-next-line no-unused-vars
		isArray: (name, jpath, isLeafNode, isAttribute) => {
			if (alwaysArray.indexOf(jpath) !== -1) return true;
		}
	}
	const parser = new XMLParser(parserConfig);
	const scalastyleObject = parser.parse(scalastyleXML);

	console.log(scalastyleObject);

	return scalastyleObject;
}

/**
 * Marks the warnings in editor.
 */
function markScalastyleInEditor() {
	const config = vscode.workspace.getConfiguration('scalastyle-marker');
	const scalastyleObject = parseScalastyleXML(config.get("scalastyleOutputFile"));


	const files = scalastyleObject['checkstyle']['file']

	diagnosticCollection.clear();

	if (!files) { // there are no warnings
		return;
	}

	console.log(files.length);
	for (let index = 0; index < files.length; index++) {
		const element = files[index];
		console.log(element['@_name'])

		const diagnostics = []
		for (let j = 0; j < element['error'].length; j++) {
			const warningParse = parseWarningMessage(element['error'][j], element['@_name']);

			let severity = vscode.DiagnosticSeverity.Error;
			switch (element['error'][j]['@_severity']) {
				case 'warning':
					severity = vscode.DiagnosticSeverity.Warning;
					break;
				case 'error':
					severity = vscode.DiagnosticSeverity.Error;
					break;
			}

			const warnDiagnostic = new vscode.Diagnostic(warningParse.range, warningParse.hoverMessage, severity)
			warnDiagnostic.source = "scalastyle"

			diagnostics.push(warnDiagnostic);
		}

		console.log(diagnostics);
		diagnosticCollection.set(vscode.Uri.file(element['@_name']), diagnostics);
		console.log("finished")
	}

}

/**
 * parses a single error object and returns the location (vscode.Range) and msg of the warning
 * @param {Object} errorElement
 * @param {string} fileName
 * @returns {Object}
 */
function parseWarningMessage(errorElement, fileName) {
	let line = 1;
	if ('@_line' in errorElement) {
		line = parseInt(errorElement['@_line'])
	}

	let col = 0;
	let colEnd = 1;

	if (fileName === vscode.window.activeTextEditor.document.fileName.toString()) {
		colEnd = vscode.window.activeTextEditor.document.lineAt(line - 1).text.length;
	}

	if ('@_column' in errorElement) {
		col = parseInt(errorElement['@_column'])
		colEnd = col + 1;
	}
	console.log(line, ":", col)

	const msg = errorElement['@_message']

	const startPos = new vscode.Position(line - 1, col);
	const endPos = new vscode.Position(line - 1, colEnd);

	const decoRange = new vscode.Range(startPos, endPos);

	return {range: decoRange, hoverMessage: msg};
}

/**
 * Runs scalastyle once, and marks its warnings in editor.
 */
function runScalastyle() {
	const config = vscode.workspace.getConfiguration('scalastyle-marker');
	const returnCode = execSync(`cd ${vscode.workspace.workspaceFolders[0].uri.fsPath} && ${config.get('scalastyleCommand')}`);
	console.log(Buffer.from(returnCode).toString('utf-8'));
	markScalastyleInEditor();
}

/**
 * Deletes diagnostics on deactivation
 */
function deactivate() {
	console.log("Extension now inactive");
	diagnosticCollection.clear();
	diagnosticCollection.dispose();
}

module.exports = {
	activate,
	deactivate
}
