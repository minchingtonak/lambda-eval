import {
    Stmt,
    Term,
    Abstraction,
    Variable,
    Application,
    StmtVisitor,
    TermStmt,
    BindingStmt,
    CommandStmt,
    CommandType,
} from "./ast";
import { Reducer } from "./reducer";
import { BindingResolver } from "./bindingresolver";
import { printTerm } from "./termprinter";
import { hashTerm, hashTermStructure } from "./termhasher";
import { InterpreterOptions } from "./types";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import Logger from "./logger";

function joinSet<T>(set: Set<T>, separator: string) {
    let joined: string = "";
    set.forEach(val => {
        joined += `${val}${separator}`;
    });
    return joined.substr(0, joined.length - separator.length);
}

export class Interpreter implements StmtVisitor<void> {
    private hashes: { [key: number]: Set<string> } = {};
    private structure_hashes: { [key: number]: Set<string> } = {};

    private addHash(term: Term, name: string) {
        const hash: number = hashTerm(term),
            s_hash: number = hashTermStructure(term);
        if (!(hash in this.hashes)) this.hashes[hash] = new Set<string>();
        if (!(s_hash in this.structure_hashes)) this.structure_hashes[s_hash] = new Set<string>();
        this.hashes[hash].add(name);
        this.structure_hashes[s_hash].add(name);
    }
    private deleteHash(term: Term, name: string) {
        const hash: number = hashTerm(term),
            s_hash: number = hashTermStructure(term),
            set: Set<string> = this.hashes[hash],
            s_set: Set<string> = this.structure_hashes[s_hash];

        set.delete(name);
        s_set.delete(name);

        // if (set.size === 0) delete this.hashes[hash];
        // if (s_set.size === 0) delete this.structure_hashes[s_hash];
    }

    private bindings: { [key: string]: Term } =
        // Process multikeys
        (dict => {
            Object.keys(dict).forEach(key => {
                const subkeys: string[] = key.split("|");
                subkeys.forEach(subkey => {
                    dict[subkey] = dict[key];
                    this.addHash(dict[key], subkey);
                });
                if (subkeys.length > 1) delete dict[key];
            });
            return dict;
        })({
            // Logic
            true: new Abstraction("t", new Abstraction("f", new Variable("t"))),
            false: new Abstraction("t", new Abstraction("f", new Variable("f"))),
            and: new Abstraction(
                "a",
                new Abstraction(
                    "b",
                    new Application(
                        new Application(new Variable("a"), new Variable("b")),
                        new Variable("a")
                    )
                )
            ),
            or: new Abstraction(
                "a",
                new Abstraction(
                    "b",
                    new Application(
                        new Application(new Variable("a"), new Variable("a")),
                        new Variable("b")
                    )
                )
            ),
            not: new Abstraction(
                "b",
                new Application(
                    new Application(new Variable("b"), new Variable("false")),
                    new Variable("true")
                )
            ),
            if: new Abstraction(
                "p",
                new Abstraction(
                    "a",
                    new Abstraction(
                        "b",
                        new Application(
                            new Application(new Variable("p"), new Variable("a")),
                            new Variable("b")
                        )
                    )
                )
            ),
            // Lists
            "pair|cons": new Abstraction(
                "x",
                new Abstraction(
                    "y",
                    new Abstraction(
                        "f",
                        new Application(
                            new Application(new Variable("f"), new Variable("x")),
                            new Variable("y")
                        )
                    )
                )
            ),
            "first|car": new Abstraction(
                "p",
                new Application(new Variable("p"), new Variable("true"))
            ),
            "second|cdr": new Abstraction(
                "p",
                new Application(new Variable("p"), new Variable("false"))
            ),
            "nil|empty": new Abstraction("x", new Variable("true")),
            "null|isempty": new Abstraction(
                "p",
                new Application(
                    new Variable("p"),
                    new Abstraction("x", new Abstraction("y", new Variable("false")))
                )
            ),
            // Trees
            tree: new Abstraction(
                "d",
                new Abstraction(
                    "l",
                    new Abstraction(
                        "r",
                        new Application(
                            new Application(new Variable("pair"), new Variable("d")),
                            new Application(
                                new Application(new Variable("pair"), new Variable("l")),
                                new Variable("r")
                            )
                        )
                    )
                )
            ),
            datum: new Abstraction("t", new Application(new Variable("first"), new Variable("t"))),
            left: new Abstraction(
                "t",
                new Application(
                    new Variable("first"),
                    new Application(new Variable("second"), new Variable("t"))
                )
            ),
            right: new Abstraction(
                "t",
                new Application(
                    new Variable("second"),
                    new Application(new Variable("second"), new Variable("t"))
                )
            ),
            // Arithmetic
            incr: new Abstraction(
                "n",
                new Abstraction(
                    "f",
                    new Abstraction(
                        "y",
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Application(new Variable("n"), new Variable("f")),
                                new Variable("y")
                            )
                        )
                    )
                )
            ),
            plus: new Abstraction(
                "m",
                new Abstraction(
                    "n",
                    new Application(
                        new Application(new Variable("m"), new Variable("incr")),
                        new Variable("n")
                    )
                )
            ),
            times: new Abstraction(
                "m",
                new Abstraction(
                    "n",
                    new Application(
                        new Application(
                            new Variable("m"),
                            new Application(new Variable("plus"), new Variable("n"))
                        ),
                        new Variable("zero")
                    )
                )
            ),
            iszero: new Abstraction(
                "n",
                new Application(
                    new Application(new Variable("n"), new Abstraction("y", new Variable("false"))),
                    new Variable("true")
                )
            ),
            "0|zero": new Abstraction("f", new Abstraction("x", new Variable("x"))),
            "1|one": new Abstraction(
                "f",
                new Abstraction("x", new Application(new Variable("f"), new Variable("x")))
            ),
            "2|two": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(new Variable("f"), new Variable("x"))
                    )
                )
            ),
            "3|three": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(new Variable("f"), new Variable("x"))
                        )
                    )
                )
            ),
            "4|four": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Variable("f"),
                                new Application(new Variable("f"), new Variable("x"))
                            )
                        )
                    )
                )
            ),
            "5|five": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Variable("f"),
                                new Application(
                                    new Variable("f"),
                                    new Application(new Variable("f"), new Variable("x"))
                                )
                            )
                        )
                    )
                )
            ),
            "6|six": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Variable("f"),
                                new Application(
                                    new Variable("f"),
                                    new Application(
                                        new Variable("f"),
                                        new Application(new Variable("f"), new Variable("x"))
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            "7|seven": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Variable("f"),
                                new Application(
                                    new Variable("f"),
                                    new Application(
                                        new Variable("f"),
                                        new Application(
                                            new Variable("f"),
                                            new Application(new Variable("f"), new Variable("x"))
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            "8|eight": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Variable("f"),
                                new Application(
                                    new Variable("f"),
                                    new Application(
                                        new Variable("f"),
                                        new Application(
                                            new Variable("f"),
                                            new Application(
                                                new Variable("f"),
                                                new Application(
                                                    new Variable("f"),
                                                    new Variable("x")
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            "9|nine": new Abstraction(
                "f",
                new Abstraction(
                    "x",
                    new Application(
                        new Variable("f"),
                        new Application(
                            new Variable("f"),
                            new Application(
                                new Variable("f"),
                                new Application(
                                    new Variable("f"),
                                    new Application(
                                        new Variable("f"),
                                        new Application(
                                            new Variable("f"),
                                            new Application(
                                                new Variable("f"),
                                                new Application(
                                                    new Variable("f"),
                                                    new Application(
                                                        new Variable("f"),
                                                        new Variable("x")
                                                    )
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            ),
        });

    private rename_free_vars: boolean;
    private logger: Logger;
    private resolver: BindingResolver;

    constructor(options: InterpreterOptions) {
        this.rename_free_vars = options.rename_free_vars as boolean;
        this.logger = new Logger({
            verbosity: options.verbosity,
            output_stream: options.output_stream,
        });
        this.resolver = new BindingResolver(this.bindings, this.logger);
    }

    interpret(source: string) {
        this.logger.setSource(source);
        const stmts: Stmt[] = new Parser(
            new Lexer(source, this.logger).lexTokens(),
            this.logger
        ).parse();

        if (this.logger.hasError) return;

        stmts.forEach(stmt => {
            stmt.accept(this);
        });
    }

    visitTermStmt(term_stmt: TermStmt): void {
        this.logger.vlog(`λ > ${printTerm(term_stmt.term)}`);
        const reduct: Term = new Reducer({
            rename_free_vars: this.rename_free_vars,
            logger: this.logger,
        }).reduceTerm(this.resolver.resolveTerm(term_stmt.term));
        this.logger.log(`>>> ${printTerm(reduct)}`);
        const hash: number = hashTerm(reduct),
            s_hash = hashTermStructure(reduct);
        if (hash in this.hashes)
            this.logger.log(`    ↳ equal to: ${joinSet(this.hashes[hash], ", ")}`);
        if (s_hash in this.structure_hashes)
            this.logger.log(
                `    ↳ structurally equivalent to: ${joinSet(this.structure_hashes[s_hash], ", ")}`
            );
        if (!(hash in this.hashes) && !(s_hash in this.structure_hashes)) this.logger.log("");
    }
    visitBindingStmt(binding: BindingStmt): void {
        this.bindings[binding.name] = binding.term;
        this.addHash(binding.term, binding.name);
    }
    visitCommandStmt(command: CommandStmt): void {
        switch (command.type) {
            case CommandType.ENV:
                this.printBindings();
                break;
            case CommandType.UNBIND:
                this.deleteHash(this.bindings[command.argument], command.argument);
                delete this.bindings[command.argument];
                break;
        }
    }

    hadError(): boolean {
        return this.logger.hasError;
    }

    clearError() {
        this.logger.hasError = false;
    }

    private printBindings() {
        Object.entries(this.bindings).forEach(binding => {
            this.logger.log(`${binding[0]}:\t${printTerm(binding[1])}`);
        });
    }
}
