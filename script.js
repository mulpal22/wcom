function push_err(str) {
    console.log(str);
}

class Token {
    static NUM = 0;
    static ID = 1;
    static SPEC = 2;
    static KWD = 3;
    static END = 4;

    constructor(ty, att) {
        /*
        this.type이 NUM이면 숫자값
                    ID이면 심볼테이블 인덱스
                    KWD, SPEC이면 그대로
        */
        this.attr = att;
        this.type = ty;
    } 
}

class Symbol {
    constructor(name, size, addr) {
        this.name = name;
        this.size = size; //배열이면 크기, 아니면 0
        this.addr = addr; //실제 메모리 주소
    }
}

class SymbolTable {
    constructor() {
        this.map = new Map();
        this.symbols = [];
        this.literals = [];
        this.idx_var = 0; 
        this.idx_lit = 0;
        this.mem_address = 0;
    }

    add(name, size, addr = -1) {
        if (addr == -1)
            this.symbols.push(new Symbol(name, size, this.mem_address));
        else
            this.symbols.push(new Symbol(name, size, addr));
        this.map.set(name, this.symbols[this.idx_var++]);
        this.mem_address += size;
    }

    addconst(value) {
        this.literals.push(new Symbol(value, 1, this.mem_address));
        this.map.set(value, this.idx_lit++);
        this.mem_address += 1;
    }

    idx() {
        return this.idx_var;
    }

    has(name) {
        return this.map.has(name);
    }

    find(name) {
        return this.map.get(name);
    }
}

class Tokenizer {
    constructor(symbol_table) {
        this.symbol_table = symbol_table;
        this.kwd_check_map = new Map();
        this.spec_map = new Map();
    }

    init() {
        for (let kwd of ["decl", "if", "while", "else", "true", "false"]) {
            this.kwd_check_map.set(kwd, new Token(Token.KWD, kwd));
        }
        //console.log(this.kwd_check_map);
        for (let ch of "+-*/(){}[];!&|=") {
            this.spec_map.set(ch, new Token(Token.SPEC, ch));
        }
    }

    tokenize(source) {
        let tkn_ret = [];

        source += " ";
        let idx = 0;
        let tmp = "";
        while (idx < source.length) {
            if ("0" <= source[idx] && source[idx] <= "9") {
                tmp = source[idx++];
                for (; (("0" <= source[idx] && source[idx] <= "9") || source[idx] == "."); idx++) {
                    tmp += source[idx];
                }
                tkn_ret.push(new Token(Token.NUM, parseFloat(tmp)));
                if (!this.symbol_table.has(tmp)) 
                    this.symbol_table.addconst(tmp);
                tmp = "";
            }

            else if (("a" <= source[idx] && source[idx] <= "z") || ("A" <= source[idx] && source[idx] <= "Z")) {
                tmp = source[idx++];
                for (; (("0" <= source[idx] && source[idx] <= "9") ||
                        ("a" <= source[idx] && source[idx] <= "z") ||
                        ("A" <= source[idx] && source[idx] <= "Z")); idx++) {
                    tmp += source[idx];
                }

                if (this.kwd_check_map.has(tmp))
                    tkn_ret.push(this.kwd_check_map.get(tmp));
                else {
                    this.kwd_check_map.set(tmp, new Token(Token.ID, tmp));
                    tkn_ret.push(new Token(Token.ID, tmp));
                }
                tmp = "";
            }

            else if (this.spec_map.has(source[idx])) {
                tkn_ret.push(this.spec_map.get(source[idx++]));
            }

            else if (source[idx] == "<") {
                idx++;
                if (source[idx] == "=" || source[idx] == "-") {
                    tkn_ret.push(new Token(Token.SPEC, "<" + source[idx]));
                    idx++;
                } else tkn_ret.push(new Token(Token.SPEC, "<"));
            }

            else if (source[idx] == ">") {
                idx++;
                if (source[idx] == "=") {
                    tkn_ret.push(new Token(Token.SPEC, ">="));
                    idx++;
                } else tkn_ret.push(new Token(Token.SPEC, ">"));
            }

            else if (source[idx] == "!") {
                idx++;
                if (source[idx] == "=") {
                    tkn_ret.push(new Token(Token.SPEC, "!="));
                    idx++;
                } else tkn_ret.push(new Token(Token.SPEC, "!"));
            }
            else if (source[idx] == " " || source[idx] == "\n" || source[idx] == "\t" || source[idx] == "\u00a0")
                idx++;
            else
            {
                push_err(`이해할 수 없는 문자입니다: ${source[idx]}`);
                idx++;
            }
        }
        tkn_ret.push(new Token(Token.END, 0));
        return tkn_ret;
    }
}

class AST_node {
    constructor (tk) {
        this.token = tk; 
        this.left = null;
        this.right = null;
    }
}

class Parser {
    constructor(tokens, symbol_table) {
        this.tkn = tokens;
        this.lookahead = this.tkn[0];
        this.idx = 0;
        this.operators = [["|"],["&"],["=", "!="],["<", ">", "<=", ">="],["+", "-"],["*", "/"]];
        this.symbol_table = symbol_table;
    }

    match(tkn) {
        if (this.lookahead.type == tkn.type && this.lookahead.attr == tkn.attr)
            this.next();
        else
            push_err(`씨발 (${tkn.type}, ${tkn.attr})이 아니고 (${this.lookahead.type}, ${this.lookahead.attr})이야`);
    }

    next() {
        this.lookahead = this.tkn[++this.idx];
    }

    /*
    stmts -> stmt;stmts |
             stmt
    */
    parse_stmts() {
        //console.log("parsing stmts");
        let stmt_node = this.parse_stmt();
        if (this.lookahead.attr == ";") {
            let conj_node = new AST_node(new Token(Token.SPEC, "conj"));
            conj_node.left = stmt_node;
            this.match(new Token(Token.SPEC, ";")); 
            conj_node.right = this.parse_stmts();
            return conj_node;
        } else {
            return stmt_node;
        }
    }

    /*
    stmt -> id[bool] <- bool |
            id <- bool |
            if (bool) stmt |
            if (bool) stmt else stmt |
            {stmts} |
            while (bool) stmt |
            decl id |
            decl id[num] |
            epsilon
    */
    parse_stmt() {
        //console.log("parsing stmt");
        if (this.lookahead.type == Token.ID) {
            return this.parse_assign_stmt();
        } 
        else if (this.lookahead.attr == "if") {
            return this.parse_if_stmt();
        }
        else if (this.lookahead.attr == "{") {
            return this.parse_block_stmt();
        }
        else if (this.lookahead.attr == "while") {
            return this.parse_while_stmt();
        }
        else if (this.lookahead.attr == "decl") {
            return this.parse_decl_stmt();
        }
            return null; //epsilon
    }

    parse_assign_stmt() {
        //console.log("parsing assign_stmt");
        //console.log(this.lookahead);
        let id_node = new AST_node(this.lookahead);
        this.next();
        if (this.lookahead.attr == "[") {
            //console.log("parsing index assign");
            this.next();
            let index_node = new AST_node(new Token(Token.SPEC, "[]"));
            index_node.left = id_node;
            index_node.right = this.parse_bool(); this.match(new Token(Token.SPEC, "]"));
            this.match(new Token(Token.SPEC, "<-"));

            let assign_node = new AST_node(new Token(Token.SPEC, "<-"));
            assign_node.left = index_node;
            assign_node.right = this.parse_bool();
            return assign_node;
        }
        else if (this.lookahead.attr == "<-") {
            //console.log("parsing simple assign");
            let assign_node = new AST_node(new Token(Token.SPEC, "<-"));
            assign_node.left = id_node;
            this.next(); assign_node.right = this.parse_bool();
            return assign_node;
        }
    }

    parse_if_stmt() {
        //console.log("parsing if_stmt");
        //console.log(this.lookahead);
        this.next(); this.match(new Token(Token.SPEC, "("));
        let if_node = new AST_node(new Token(Token.KWD, "if"));
        if_node.left = this.parse_bool();
        this.match(new Token(Token.SPEC, ")"));
        if_node.right = this.parse_stmt();
        if (this.lookahead.attr == "else") {
            let else_node = new AST_node(this.lookahead);
            this.next();
            else_node.left = if_node;
            else_node.right = this.parse_stmt();
            return else_node;
        }
        return if_node;
    }

    parse_block_stmt() {
        //console.log("parsing block_stmt");
        //onsole.log(this.lookahead);
        this.next();
        let new_node = this.parse_stmts();
        this.match(new Token(Token.SPEC, "}"));
        return new_node;
    }

    parse_while_stmt() {
        //console.log("parsing while_stmt");
        //console.log(this.lookahead);
        this.next(); this.match(new Token(Token.SPEC, "("));
        let while_node = new AST_node(new Token(Token.KWD, "while"));
        while_node.left = this.parse_bool();
        this.match(new Token(Token.SPEC, ")"));
        while_node.right = this.parse_stmt();
        return while_node;
    }

    parse_decl_stmt() {
        //console.log("parsing decl_stmt");
        this.next();
        let symbol_name = this.lookahead.attr;
        this.next();
        if (this.lookahead.attr == "[") {
            //console.log("parsing index assign");
            this.next();
            this.symbol_table.add(symbol_name, this.lookahead.attr); 
            this.address += this.lookahead.attr; this.next();
            this.match(new Token(Token.SPEC, "]"));
        }
        else 
            this.symbol_table.add(symbol_name, 1); 
            this.address += 1;
        return null;
    }

    parse_leftassoc(depth) {
        //console.log("parsing leftassoc at depth " + depth);
        //console.log(this.lookahead);
        if (depth == this.operators.length) {
            return this.parse_unary();
        }
        let left_node = this.parse_leftassoc(depth + 1);
        if (this.lookahead.type == Token.SPEC && this.operators[depth].includes(this.lookahead.attr)) {
            let op_node = new AST_node(this.lookahead);
            this.next();
            op_node.left = left_node;
            op_node.right = this.parse_leftassoc(depth);
            return op_node;
        }
        return left_node;
    }

    parse_bool() {
        return this.parse_leftassoc(0);
    }

    /*
    unary -> !primary |
             -primary |
             primary
    */
    parse_unary() {
        //console.log("parsing unary");
        //console.log(this.lookahead);
        if (this.lookahead.attr == "!") {
            let not_node = new AST_node(this.lookahead);
            this.next();
            not_node.right = this.parse_primary();
            return not_node;
        }
        else if (this.lookahead.attr == "-") {
            let neg_node = new AST_node(this.lookahead);
            this.next();
            neg_node.right = this.parse_primary();
            return neg_node;
        }
        else
            return this.parse_primary();
    }

    /*
    primary -> num |
               id |
               id[bool] |
               (bool)
    */
    parse_primary() {
        //console.log("parsing primary");
        //console.log(this.lookahead);
        if (this.lookahead.type == Token.NUM || this.lookahead.type == Token.KWD) {
            let new_node = new AST_node(this.lookahead);
            this.next();
            return new_node;
        } 
        else if (this.lookahead.type == Token.ID) {
            let id_node = new AST_node(this.lookahead);
            this.next();
            if (this.lookahead.attr == "[") {
                this.next();
                let index_node = new AST_node(new Token(Token.SPEC, "[]"));
                index_node.left = id_node;
                index_node.right = this.parse_bool(); this.match(new Token(Token.SPEC, "]"));
                return index_node;
            }
            return id_node;
        }
        else if (this.lookahead.attr == "(") {
            this.next();
            let new_node = this.parse_bool();
            this.match(new Token(Token.SPEC, ")"));
            return new_node;
        }
    }
}

class CodeGen1 {
    constructor(symbol_table) {
        this.symbol_table = symbol_table;
        this.code = "";
        this.tmp_idx = 0;
        this.code_pos = 0;
    }

    push_code(str) {
        this.code += str;
        this.code_pos++;
    }

    generate_temp() {
        this.symbol_table.add(`t${this.tmp_idx}`, 1);
        return `t${this.tmp_idx++}`;
    }

    generate_label() {
        return `L${this.tmp_idx++}`;
    }

    push_label(label) {
        //console.log(label);
        this.symbol_table.add(`${label}`, 0, this.code_pos);
        //console.log(this.symbol_table.has(label));
        this.code += `${label}:\n`;
    }

    gen(root) {
        if (root == null) return;
        else if (root.token.type == Token.ID) {
            return `${root.token.attr}`;
        } 
        else if (root.token.type == Token.NUM || root.token.attr == "true" || root.token.attr == "false") {
            return `${root.token.attr}`;
        }
        else if (root.token.type == Token.SPEC) {
            if (root.token.attr == "conj") {
                this.gen(root.left);
                return this.gen(root.right);
            }
            let l = this.gen(root.left);
            let r = this.gen(root.right);
            let temp_space = this.generate_temp();
            if (root.left == null)
                this.push_code(`${temp_space} = ${root.token.attr} ${r}\n`);
            else
                this.push_code(`${temp_space} = ${l} ${root.token.attr} ${r}\n`);
            return temp_space;
        }
        else if (root.token.type == Token.KWD) {
            if (root.token.attr == "if") {
                let cond = this.gen(root.left);
                let label_true = this.generate_label();
                this.push_code(`if-goto ${cond} ${label_true}\n`);
                let label_out = this.generate_label();
                this.push_code(`goto ${label_out}\n`);
                this.push_label(label_true);
                this.gen(root.right);
                this.push_label(label_out);
            } 
            else if (root.token.attr == "else") {
                let cond = this.gen(root.left.left);
                let label_true = this.generate_label();
                this.push_code(`if-goto ${cond} ${label_true}\n`);
                let label_out = this.generate_label();
                this.push_code(`goto ${label_out}\n`);
                this.push_label(label_true);
                this.gen(root.left.right);
                this.push_code(`goto ${label_out}\n`);
                this.push_label(label_out);
                this.gen(root.right);
            }
            else if (root.token.attr == "while") {
                let label_start = this.generate_label();
                this.push_label(label_start);
                let cond = this.gen(root.left);
                let label_true = this.generate_label();
                this.push_code(`if-goto ${cond} ${label_true}\n`);
                let label_out = this.generate_label();
                this.push_code(`goto ${label_out}\n`);
                this.push_label(label_true);
                this.gen(root.right);
                this.push_code(`goto ${label_start}\n`);
                this.push_label(label_out);
            } 
        }
    }
}

class VirtualCode {
    constructor(instruction, arg1, arg2, result) {
        this.instruction = instruction;
        this.arg1 = arg1;
        this.arg2 = arg2;
        this.result = result;
    }
}

class CodeGen2 {
    constructor(symbol_table) {
        this.symbol_table = symbol_table;
        this.instruction = new Map();
        this.code = [];
        this.operators = ["+", "-", "*", "/", "<", ">", "<=", ">=", "=", "!=", "&", "|", "!", "<-", "[]"];
    }

    init() {
        for (let i = 0; i < this.operators.length; i++) {
            this.instruction.set(this.operators[i], i + 1);
        }
    }

    gen(intermediate_code) {
        for (let line of intermediate_code.split("\n")) {
            let parts = line.split(" ");
            //console.log(parts);
            if (parts.length == 1) continue; //라벨
            else if (parts.length == 2) { //점프
                this.code.push(new VirtualCode(0, this.symbol_table.find(parts[1]).addr, null, null));
            }
            else if (parts.length == 3) { //if-goto
                this.code.push(new VirtualCode(16, this.symbol_table.find(parts[1]).addr, this.symbol_table.find(parts[2]).addr, null));
            }
            else if (parts.length == 4) { //단항연산자
                this.code.push(new VirtualCode(this.instruction.get(parts[2]), 
                                                  this.symbol_table.find(parts[3]).addr,
                                                  null,
                                                  this.symbol_table.find(parts[0]).addr));
            }
            else if (parts.length == 5) { //이항연산자
                this.code.push(new VirtualCode(this.instruction.get(parts[3]), 
                                                  this.symbol_table.find(parts[2]).addr,
                                                  this.symbol_table.find(parts[4]).addr,
                                                  this.symbol_table.find(parts[0]).addr));
            }
        }
    }
}

function type_string(t) {
    return ["NUM", "ID", "SPEC", "KWD", "END"][t];
}

function print_AST(textbox, node, depth=0) {
    if (node == null) return;
    textbox.innerHTML += "--".repeat(depth) + `(${type_string(node.token.type)}, ${node.token.attr})<br>`;
    print_AST(textbox, node.left, depth + 1);
    print_AST(textbox, node.right, depth + 1);
}

document.getElementById("compile_btn").onclick = function() {
    let source_code = document.getElementById("source_code").innerText;
    let st = new SymbolTable();
    let tk = new Tokenizer(st);
    tk.init();
    let tokens = tk.tokenize(source_code);
    
    let token_obj = document.getElementById("token_code");
    token_obj.innerHTML = "";
    for (let tk of tokens) {
        token_obj.innerHTML += `(${type_string(tk.type)}, ${tk.attr})<br>`;
    }

    let parser = new Parser(tokens, st);
    let ast = parser.parse_stmts();
    let ast_obj = document.getElementById("ast_code");
    //console.log(ast);
    ast_obj.innerHTML = "";
    print_AST(ast_obj, ast);

    let cg1 = new CodeGen1(st);
    cg1.gen(ast);
    //console.log(cg1.code);  
    let ir_obj = document.getElementById("ir_code");
    ir_obj.innerHTML = cg1.code.replaceAll("\n", "<br>");   

    let sym_obj = document.getElementById("symbol_table_code");
    sym_obj.innerHTML = "";
    for (let sym of st.symbols) {
        sym_obj.innerHTML += `${sym.name} | 크기: ${sym.size}, 주소: ${sym.addr}<br>`;
    }
}
