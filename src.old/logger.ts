import { LoggerOptions } from './types';
import { Token } from './token';
import { TokenType } from './tokentype';
import { Writable } from 'stream';

export enum Verbosity {
	NONE = 0,
	LOW,
	HIGH,
}

class Logger {
	hasError = false;
	private verbosity = Verbosity.NONE;
	private source: string[] = [];
	private os: Writable = process.stdout;

	constructor(options?: LoggerOptions) {
		this.setOptions(options);
	}

	setOptions(options?: LoggerOptions) {
		this.verbosity = options
			? options.verbosity !== undefined
				? options.verbosity
				: this.verbosity
			: this.verbosity || Verbosity.NONE;

		this.os = options
			? options.output_stream !== undefined
				? options.output_stream
				: this.os
			: this.os || process.stdout;

		if (options && options.source) {
			this.source = options.source.split('\n');
		}
	}

	log(...message: string[]) {
		this.print(message, Verbosity.NONE);
	}

	vlog(...message: string[]) {
		this.print(message, Verbosity.LOW);
	}

	vvlog(...message: string[]) {
		this.print(message, Verbosity.HIGH);
	}

	reportError(token: Token, message: string, verbose = true) {
		this.hasError = true;
		this.log(
			`Error at ${
				token.type === TokenType.EOF
					? 'end of file'
					: `line ${token.line} [${token.start}, ${token.start + token.length}]`
			}: ${message}`
		);
		if (verbose) {
			this.verboseError(token);
		}
	}

	private print(message: string[], target: Verbosity) {
		if (this.verbosity < target) {
			return;
		}
		this.os.write(`${message.join(' ')}\n`);
	}

	private verboseError(token: Token) {
		let indicator = '';
		for (let i = 1; i < token.start + token.length; ++i) {
			indicator += i >= token.start ? '^' : ' ';
		}
		if (token.type === TokenType.EOF) {
			indicator += '^';
		}
		this.log(`\t${this.source[token.line - 1]}\n\t${indicator}\n`);
	}
}

export class LexError {
	static type = 'lexerror';
}
export class ParseError {
	static type = 'parseerror';
}

export default Logger;
