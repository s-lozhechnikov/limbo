
const PRIVATE = Symbol();
const SUB_QUERY = Symbol();
const tools = require("./tools");
const ops = [
    {
        regExp : /\!(\$?_?\w+)/, //negative
        handle : (run, args) => {
            return !(args[0] && args[0] !=="undefined" && JSON.parse(args[0]));
        }
    },
    {
        regExp : /(\$?_?[\w\.]+)(\=\=\=?)(\$?_?\w+)/, //is equal
        handle : (run, args)=>{ 
            return args[1] == "===" ? 
                ((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) === (args[2] === 'undefined' ? undefined : JSON.parse(args[2]))) : 
                ((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) == (args[2] === 'undefined' ? undefined : JSON.parse(args[2])))
        }
    },
    {
        regExp : /(\$?_?\w+)\!\=(\$?_?\w+)/, //is unequal
        handle : (run, args)=>{
            return JSON.parse(args[0]) != JSON.parse(args[1])
        }
    },
    {
        regExp : /(\w+)\~(.+)?/, //execute
        handle : (run, args) => {
            return run.handle(args[0], (args[1] && JSON.parse(args[1])))
        }
    },
    {
        regExp : /^\?(\$?_?[\w\.]+)(\$_?\w+)(?:\:(\$_\w+))?/, // condition
        handle : (run, args, stack) =>{
             (args[0] && args[0] !== "undefined" && JSON.parse(args[0])) ? stack.add(args[1]) : (args.length > 2 && stack.add(args[2]))
        }
    },
    {
        regExp : /\$(\w+)\=(.+)/, //assign
        handle : (run, args)=>{
            if(args[1] === "undefined") {
                param = null;
            }
            else {
                try {
                    var param = JSON.parse(args[1]);
                }
                catch(e) {
                    throw new Error(e);
                }
            }
            run.setVar("$"+args[0], param);
            return param;
        }
    },
    {
        regExp : /^\=\>(.+)/, //return
        handle : (run, args)=>{
            if(args[0] === "undefined") {
                var res = null;
            }
            else {
                try {
                    var res = JSON.parse(args[0]);
                } catch(e) {
                    throw e;
                }
            }
            return run.setVar("$__", res);
        }
    },
    {
        regExp : /^\-\>@_(\d+)/, //return bookmark
        handle : (run, args)=>{
            return run.setVar("$@", args[0]);
        }
    }
]

class Run {
    constructor(query, handlers, localResolver, getResolvers, options) {
        this[PRIVATE] = {};
        this[PRIVATE].options = options;
        this[PRIVATE].scope = {};
        this[PRIVATE].varCount = 0;
        this[PRIVATE].bookmarkCount = 0;
        this[PRIVATE].query = typeof query == "string" ? query
            .replace(/\"([^"]*)\"|\'([^']*)\'/g, (m, str)=>this.setVar({"true":true, "false":false}[str] || str)) //save strings and booleans
            .replace(/\s+/g, '')
            .split(";").filter(el=>el!=="") : query;
        this[PRIVATE].current = 0;
        this[PRIVATE].score = 0;
        this[PRIVATE].bookmarks = {};
        this[PRIVATE].currentLine;
        this[PRIVATE].prom = Promise.resolve({});
        this[PRIVATE].currentChunk = {
            resolver : null,
            lines : [],
            score : 0,
            needs : [],
            resolves : []
        }
        this[PRIVATE].localResolver = localResolver;
        this[PRIVATE].handlers = handlers;
        this[PRIVATE].getResolvers = getResolvers;
    }
    handle(method, param) {
        for(let i in this[PRIVATE].handlers){
            let handler = this[PRIVATE].handlers[i];
            if(handler.regExp.test(method)){
                return Promise.resolve().then(()=>handler.handle(param, method));
            }
        }
    }
    updateScope(data) {
        data && Object.keys(data).forEach(key=>{
            this.setVar("$"+key, data[key])
        });
    }
    pastParams(query) {
        return query.replace(/\$_?[\w+\.]+/g, (name)=>{
            var path = name.split("."),
                param = this.getVar(path[0]);
            if(param === undefined) return name;
            var param = path.length > 1 ? tools.lookDeep(path.slice(1).join("."), param) : param;
            if(param === undefined) return name;

            return JSON.stringify(param); 
        })
    }
    getNextVarKey() {
        return `$_${this[PRIVATE].varCount++}`
    }
    getNextBookmarkKey() {
        return `@_${this[PRIVATE].bookmarkCount++}`
    }
    getNextLine(){
        var line = this[PRIVATE].query[this[PRIVATE].current++];
        this[PRIVATE].score += tools.getBalance(line);
        this[PRIVATE].currentLine = line;
        return line;
    }
    stepBack() {
        this[PRIVATE].score -= tools.getBalance(this[PRIVATE].currentLine);
        this[PRIVATE].current--;
        this[PRIVATE].currentLine = this[PRIVATE].query[this[PRIVATE].current];
    }
    splitLine() {
        var that = this;        
        this[PRIVATE].currentLine = this[PRIVATE].currentLine.replace(/\(([^\(]+)\)/, (str, call)=>{
            let key = this.getNextVarKey() + '_';
            that[PRIVATE].query.splice(this[PRIVATE].current-1, 0, key+"="+call);
            return key;
        });
        this[PRIVATE].query.splice(this[PRIVATE].current, 1, this[PRIVATE].currentLine);
        this[PRIVATE].current--;
        this[PRIVATE].currentLine = this[PRIVATE].query[this[PRIVATE].current];
    }
    adjustChunk(){
        if(this[PRIVATE].score == 0) {
            return 
        }
        var bookmark = this.getNextBookmarkKey();
        this[PRIVATE].bookmarks[bookmark] = this[PRIVATE].current;
        this[PRIVATE].currentChunk.lines.push(`->${bookmark}`);        
        var score = 0;        
        while(score >= 0) {
            let line = this.getNextLine(),
                balance = tools.getBalance(line);
            score += balance;
            this[PRIVATE].score += balance;
            if(score == 0 && ~line.indexOf("}") && ~line.indexOf("}") < line.indexOf("}")) {
                score --;
            }
        }
        this.stepBack();
    }
    hasNextLine(){
        return this[PRIVATE].current < this[PRIVATE].query.length;
    }
    setVar(key, val) {
        if(val === undefined) {
            let name = this.getNextVarKey();
            this[PRIVATE].scope[name] = key;
            return name;
        }
        this[PRIVATE].scope[key] = val;
        return;
    }
    getVar(key) {
        let val = this[PRIVATE].scope[key];
        if((/^\$_[^_]/).test(key)) {
            delete this[PRIVATE].scope[key];
        }
        return val;
    }
    setFunction(key, val) {
        if(!val) {
            let name = this.getNextVarKey();
            this[PRIVATE].scope[name] = {[SUB_QUERY] : key};
            return name;
        }
        this[PRIVATE].scope[key] = {[SUB_QUERY] : val};
        return;
    }
    getResolvedScope(){
        this[PRIVATE].prom = this[PRIVATE].prom.then(()=>{
            var keys = Object.keys(this[PRIVATE].scope).filter(key=>!(/^\$\_\d+$/).test(key));
            return Promise.all(keys.map(key=>this[PRIVATE].scope[key])).then(vals=>{
                if(~keys.indexOf("$__")) {
                    return this[PRIVATE].scope["$__"];
                }
                var resolved = {};
                keys.forEach((key, index)=>{
                    resolved[key.substring(1)] = vals[index];
                });
                return resolved;
            });
        });
        return this[PRIVATE].prom;
    }
    executeLine(line, stack, prom){
        var that = this;
        var prom = prom || Promise.resolve();
        return prom.then(()=>{
            if(~line.indexOf("(")) {
                let newProm;
                return that.executeLine(line.replace(/\(([^\(\)]+)\)/, (m, expr)=>{
                    var newProm = that.executeLine(expr, stack, prom);                  
                    return that.setVar(newProm);
                }), stack, newProm);
            } 
            for(let i = 0; i < ops.length; i++) {
                let op = ops[i];
                if(op.regExp.test(line)) {      
                    let newProm;    
                    return that.executeLine(line.replace(op.regExp, function(str){
                        var args = Object.values(arguments);
                        args = args.slice(1, args.length - 2);
                        var paramMap = that.getParamsFromQuery(str),
                            newProm = Promise.all(Object.values(paramMap)).then(values=>{                      
                                Object.keys(paramMap).forEach((key, index)=>{
                                    var path = key.split("."),
                                        val = path.length > 1 ? tools.lookDeep(path.slice(1).join("."), values[index]) : values[index];
                                        args = args.filter(arg=>arg!==undefined).map(arg=>{
                                            return arg.replace(key, typeof val == "object" && val !== null && val[SUB_QUERY] ? val[SUB_QUERY] : JSON.stringify(val))
                                        })
                                });
                                return op.handle(that, args, stack);
                            }).then(r=>{
                                if(that.getVar("$__") || that.getVar("$@")) {
                                    stack.clear();
                                }
                                return r;
                            }).catch(e=>{
                                throw new Error(`Error during executing ${str}. Details: ${e.stack}`);
                            });
                        return that.setVar(newProm); 
                    }), stack, newProm);
                }
            }
            return prom.then(r=>{
                var paramMap = that.getParamsFromQuery(line),
                    vals = Object.values(paramMap);
                if(!vals.length) {
                    return r;
                }
                return Promise.all(vals).then(values=>{
                    Object.keys(paramMap).forEach((key, index)=>{
                        var path = key.split("."),
                            val = path.length > 1 ? tools.lookDeep(path.slice(1).join("."), values[index]) : values[index];
                            line = line.replace(key, JSON.stringify(val));
                    });
                    try {
                        return line == "undefined" ? undefined : JSON.parse(line);
                    } catch(e) {
                        throw new Error ("Error durring parsing expression "+line+": invalid JSON")
                    }
                });
            });
        })
    }
    getParamsFromQuery(query) {
        var res = {};
        (query.match(/\$_?[\w\.]+/g) || []).forEach(key=>{
            var path = key.split(".");
            res[key] = this.getVar(path[0]);
        });
        return res;
    }
    startFromBookMark(bookmark) {
        var score = tools.getBalance(this[PRIVATE].query.slice(0, bookmark).join(";")),
            rest = tools.saveTopLevelFunction(this[PRIVATE].query.slice(bookmark).join(";")),
            newQuery = rest.str.split(";").filter(el=>!(/^\}\:/).test(el));
        this[PRIVATE].current = 0;
        this[PRIVATE].query = newQuery;
        delete this[PRIVATE].scope["$@"];
    }
    execute() {
        while(this.hasNextLine()) {
            var line = this.getNextLine(),
                calls = tools.getCalls(line),
                resolvers = this[PRIVATE].getResolvers(calls);
            if(resolvers.length > 1) {
                this.splitLine();
                continue;
            }

            this[PRIVATE].currentChunk.resolves = this[PRIVATE].currentChunk.resolves.contact(
                tools.getAssigned(line)).filter((el, index, arr)=>arr.indexOf(el) == index);
            this[PRIVATE].currentChunk.needs = this[PRIVATE].currentChunk.needs.contact(
                tools.getDependent(line).filter(el=>!~this[PRIVATE].currentChunk.resolves.indexOf(el)))
                    .filter((el, index, arr)=>arr.indexOf(el) == index);
            
            this[PRIVATE].currentChunk.score = this[PRIVATE].score;
            if(this.readyToResolve(resolvers[0])) {
                if(this[PRIVATE].currentChunk.score > 0) {
                    this.adjustChunk();
                    continue;
                }
                this[PRIVATE].current--;    
                this.resolveChunk({
                    resolver : this[PRIVATE].currentChunk.resolver,
                    lines : this[PRIVATE].currentChunk.lines.join(";").split(";")
                });
            }
        }
        return this.resolveChunk().then(()=>this.getResolvedScope());
    }

    resolveChunk(chunk) {
        chunk = chunk || this[PRIVATE].currentChunk;
        let query = chunk.lines.join(";");
        chunk.resolver = chunk.resolver || this[PRIVATE].localResolver;
        this[PRIVATE].prom = this[PRIVATE].prom.then(()=>{
            return chunk.resolver.handle(chunk.resolver.isLocal 
                ? query 
                : this.pastParams(query.replace(/\=\>([^\;]+)/g, (m, p)=>`=>{"__":(${p})}`)), this, this[PRIVATE].context).then(r=>chunk.resolver.isLocal ? r : this.updateScope(r));
        });
        return this[PRIVATE].prom.then(r=>{
            var bookmark = this[PRIVATE].bookmarks["@_"+this.getVar("$@")];
            if(bookmark !== undefined) {
                this.startFromBookMark(+bookmark-1);
            }            
            this[PRIVATE].currentChunk = {
                resolver : null,
                lines : []
            }
            if(~Object.keys(this[PRIVATE].scope).indexOf("$__")) return this[PRIVATE].scope["$__"];
            return this.hasNextLine() ? this.execute() : r;
        });
    }
    readyToResolve(resolver){
        if(!resolver || !this[PRIVATE].currentChunk.resolver || this[PRIVATE].currentChunk.resolver.id == resolver.id) {
            this[PRIVATE].currentChunk.lines.push(this[PRIVATE].currentLine);
            !this[PRIVATE].currentChunk.resolver && (this[PRIVATE].currentChunk.resolver = resolver);
            return false;
        }
        return true;
    }
}

module.exports = Run;