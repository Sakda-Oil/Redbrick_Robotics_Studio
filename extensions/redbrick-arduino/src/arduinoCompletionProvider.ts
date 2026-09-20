/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

interface ICompletionDefinition {
	readonly label: string;
	readonly insertText: string;
	readonly detail: string;
	readonly documentation: string;
	readonly kind?: vscode.CompletionItemKind;
}

const functions: readonly ICompletionDefinition[] = [
	{ label: 'pinMode', insertText: 'pinMode(${1:pin}, ${2|INPUT,OUTPUT,INPUT_PULLUP|});', detail: 'void pinMode(uint8_t pin, uint8_t mode)', documentation: 'Configures a digital pin as an input or output.' },
	{ label: 'digitalWrite', insertText: 'digitalWrite(${1:pin}, ${2|HIGH,LOW|});', detail: 'void digitalWrite(uint8_t pin, uint8_t value)', documentation: 'Writes HIGH or LOW to a digital pin.' },
	{ label: 'digitalRead', insertText: 'digitalRead(${1:pin})', detail: 'int digitalRead(uint8_t pin)', documentation: 'Reads HIGH or LOW from a digital pin.' },
	{ label: 'analogRead', insertText: 'analogRead(${1:pin})', detail: 'int analogRead(uint8_t pin)', documentation: 'Reads the value from an analog input pin.' },
	{ label: 'analogWrite', insertText: 'analogWrite(${1:pin}, ${2:value});', detail: 'void analogWrite(uint8_t pin, int value)', documentation: 'Writes an analog/PWM value to a pin.' },
	{ label: 'delay', insertText: 'delay(${1:milliseconds});', detail: 'void delay(unsigned long milliseconds)', documentation: 'Pauses the program for the specified number of milliseconds.' },
	{ label: 'delayMicroseconds', insertText: 'delayMicroseconds(${1:microseconds});', detail: 'void delayMicroseconds(unsigned int microseconds)', documentation: 'Pauses the program for the specified number of microseconds.' },
	{ label: 'millis', insertText: 'millis()', detail: 'unsigned long millis()', documentation: 'Returns milliseconds elapsed since the program started.' },
	{ label: 'micros', insertText: 'micros()', detail: 'unsigned long micros()', documentation: 'Returns microseconds elapsed since the program started.' },
	{ label: 'map', insertText: 'map(${1:value}, ${2:fromLow}, ${3:fromHigh}, ${4:toLow}, ${5:toHigh})', detail: 'long map(long value, long fromLow, long fromHigh, long toLow, long toHigh)', documentation: 'Maps a number from one range to another.' },
	{ label: 'constrain', insertText: 'constrain(${1:value}, ${2:minimum}, ${3:maximum})', detail: 'constrain(value, minimum, maximum)', documentation: 'Constrains a value to a range.' },
	{ label: 'random', insertText: 'random(${1:min}, ${2:max})', detail: 'long random(long min, long max)', documentation: 'Returns a pseudo-random number.' },
	{ label: 'randomSeed', insertText: 'randomSeed(${1:seed});', detail: 'void randomSeed(unsigned long seed)', documentation: 'Initializes the pseudo-random number generator.' },
	{ label: 'tone', insertText: 'tone(${1:pin}, ${2:frequency}, ${3:duration});', detail: 'void tone(uint8_t pin, unsigned int frequency, unsigned long duration)', documentation: 'Generates a square wave on a pin.' },
	{ label: 'noTone', insertText: 'noTone(${1:pin});', detail: 'void noTone(uint8_t pin)', documentation: 'Stops a tone generated on a pin.' },
	{ label: 'attachInterrupt', insertText: 'attachInterrupt(digitalPinToInterrupt(${1:pin}), ${2:handler}, ${3|RISING,FALLING,CHANGE,LOW,HIGH|});', detail: 'void attachInterrupt(interrupt, function, mode)', documentation: 'Attaches an interrupt service routine.' },
	{ label: 'detachInterrupt', insertText: 'detachInterrupt(digitalPinToInterrupt(${1:pin}));', detail: 'void detachInterrupt(interrupt)', documentation: 'Disables an interrupt.' },
	{ label: 'yield', insertText: 'yield();', detail: 'void yield()', documentation: 'Allows background tasks to run on supported boards.' }
];

const serialFunctions: readonly ICompletionDefinition[] = [
	{ label: 'begin', insertText: 'begin(${1|9600,115200,230400,460800,921600|});', detail: 'void Serial.begin(unsigned long baud)', documentation: 'Starts serial communication at the selected baud rate.' },
	{ label: 'end', insertText: 'end();', detail: 'void Serial.end()', documentation: 'Stops serial communication.' },
	{ label: 'available', insertText: 'available()', detail: 'int Serial.available()', documentation: 'Returns the number of bytes available to read.' },
	{ label: 'availableForWrite', insertText: 'availableForWrite()', detail: 'int Serial.availableForWrite()', documentation: 'Returns the number of bytes available in the transmit buffer.' },
	{ label: 'read', insertText: 'read()', detail: 'int Serial.read()', documentation: 'Reads the next byte from the serial port.' },
	{ label: 'peek', insertText: 'peek()', detail: 'int Serial.peek()', documentation: 'Returns the next byte without removing it from the buffer.' },
	{ label: 'readBytes', insertText: 'readBytes(${1:buffer}, ${2:length})', detail: 'size_t Serial.readBytes(char *buffer, size_t length)', documentation: 'Reads characters into a buffer.' },
	{ label: 'readString', insertText: 'readString()', detail: 'String Serial.readString()', documentation: 'Reads incoming serial data as a String.' },
	{ label: 'readStringUntil', insertText: "readStringUntil('${1:\\n}')", detail: 'String Serial.readStringUntil(char terminator)', documentation: 'Reads a String until the terminator is found.' },
	{ label: 'write', insertText: 'write(${1:value});', detail: 'size_t Serial.write(value)', documentation: 'Writes binary data to the serial port.' },
	{ label: 'print', insertText: 'print(${1:value});', detail: 'size_t Serial.print(value)', documentation: 'Prints data as human-readable text.' },
	{ label: 'println', insertText: 'println(${1:value});', detail: 'size_t Serial.println(value)', documentation: 'Prints data followed by a line ending.' },
	{ label: 'printf', insertText: 'printf("${1:format}", ${2:values});', detail: 'size_t Serial.printf(const char *format, ...)', documentation: 'Prints formatted data on supported boards.' },
	{ label: 'flush', insertText: 'flush();', detail: 'void Serial.flush()', documentation: 'Waits for outgoing serial data to complete.' },
	{ label: 'setTimeout', insertText: 'setTimeout(${1:milliseconds});', detail: 'void Serial.setTimeout(unsigned long milliseconds)', documentation: 'Sets the maximum wait time for serial stream operations.' }
];

const snippets: readonly ICompletionDefinition[] = [
	{ label: 'setup', insertText: 'void setup() {\n\t${1:// initialization}\n}', detail: 'Arduino setup function', documentation: 'Runs once when the board starts.', kind: vscode.CompletionItemKind.Snippet },
	{ label: 'loop', insertText: 'void loop() {\n\t${1:// main code}\n}', detail: 'Arduino loop function', documentation: 'Runs repeatedly after setup completes.', kind: vscode.CompletionItemKind.Snippet },
	{ label: 'setup + loop', insertText: 'void setup() {\n\t${1:// initialization}\n}\n\nvoid loop() {\n\t${2:// main code}\n}', detail: 'Complete Arduino sketch', documentation: 'Creates the standard Arduino sketch structure.', kind: vscode.CompletionItemKind.Snippet },
	{ label: 'if', insertText: 'if (${1:condition}) {\n\t${2}\n}', detail: 'if statement', documentation: 'Runs code when a condition is true.', kind: vscode.CompletionItemKind.Snippet },
	{ label: 'for', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t${3}\n}', detail: 'for loop', documentation: 'Repeats code using a counter.', kind: vscode.CompletionItemKind.Snippet },
	{ label: 'while', insertText: 'while (${1:condition}) {\n\t${2}\n}', detail: 'while loop', documentation: 'Repeats code while a condition is true.', kind: vscode.CompletionItemKind.Snippet }
];

const constants = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'RISING', 'FALLING', 'CHANGE', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const types = ['bool', 'boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short', 'String', 'unsigned int', 'unsigned long', 'void', 'word'];

const signatures = new Map<string, string>([
	...functions.map(definition => [definition.label, definition.detail] as const),
	...serialFunctions.map(definition => [`Serial.${definition.label}`, definition.detail] as const)
]);

export class ArduinoCompletionProvider implements vscode.CompletionItemProvider, vscode.SignatureHelpProvider {
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
		const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
		if (/\bSerial\w*\.\w*$/.test(linePrefix)) {
			return serialFunctions.map(definition => this.createItem(definition));
		}
		return [
			...snippets.map(definition => this.createItem(definition)),
			...functions.map(definition => this.createItem(definition)),
			...serialFunctions.map(definition => this.createItem({ ...definition, label: `Serial.${definition.label}`, insertText: `Serial.${definition.insertText}` })),
			...constants.map(label => this.createValue(label, vscode.CompletionItemKind.Constant, 'Arduino constant')),
			...types.map(label => this.createValue(label, vscode.CompletionItemKind.Keyword, 'Arduino/C++ type'))
		];
	}

	provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position): vscode.SignatureHelp | undefined {
		const prefix = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 5), 0), position));
		const match = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\(([^()]*)$/.exec(prefix);
		if (!match) {
			return undefined;
		}
		const signature = signatures.get(match[1]);
		if (!signature) {
			return undefined;
		}
		const help = new vscode.SignatureHelp();
		help.signatures = [new vscode.SignatureInformation(signature)];
		help.activeSignature = 0;
		help.activeParameter = match[2].split(',').length - 1;
		return help;
	}

	private createItem(definition: ICompletionDefinition): vscode.CompletionItem {
		const item = new vscode.CompletionItem(definition.label, definition.kind ?? vscode.CompletionItemKind.Function);
		item.insertText = new vscode.SnippetString(definition.insertText);
		item.detail = definition.detail;
		item.documentation = new vscode.MarkdownString(definition.documentation);
		item.sortText = definition.kind === vscode.CompletionItemKind.Snippet ? `0-${definition.label}` : `1-${definition.label}`;
		return item;
	}

	private createValue(label: string, kind: vscode.CompletionItemKind, detail: string): vscode.CompletionItem {
		const item = new vscode.CompletionItem(label, kind);
		item.detail = detail;
		item.sortText = `2-${label}`;
		return item;
	}
}
