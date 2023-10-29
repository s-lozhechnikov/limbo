const tools = require("./tools");

const PRIVATE = Symbol(),
    LOCAL_RESOLVER = Symbol(),
    Run = require("./Run");

class Stack {
    constructor(query) {
        this[PRIVATE] = {};
        this[PRIVATE].lines = typeof query == "string" ? query.split(";") : query;
    }
    hasNext() {
        return !!this[PRIVATE].lines.length;
    }
    next() {
        return this[PRIVATE].lines.shift();
    }
    add(lines){
        this[PRIVATE].lines.unshift.apply(this[PRIVATE].lines, typeof lines == "string" ? lines.split(";") : lines);
    }
    clear() {
        this[PRIVATE].lines = [];
    }
}

function saveNestedFunctions(query, run) {
    var start = query.indexOf("@{");
    if(start == -1) {
        return query
    }
    let counter = 1,
        current = start+1;
    while(counter != 0) {
        current++;
        counter = counter + ({
            "{" : 1,
            "}" : -1
        }[query[current]] || 0);
    }
    return query.substr(0, start) + run.setFunction(saveNestedFunctions(query.substr(start+2, current-start-2), run)) + saveNestedFunctions(query.substr(current+1), run);
}

class Limbo {
    constructor(options){
        var that = this;
        this[PRIVATE] = {
            limits : {
                QUERY_LENGTH : options?.limits?.QUERY_LENGTH || 100,
                VARIABLE_COUNT : options?.limits?.VARIABLE_COUNT || 20
            },
            getResolvers(calls){
                return calls.map(call=>{
                    for(let key in that[PRIVATE].resolvers) {
                        if(!that[PRIVATE].resolvers[key].regExp || that[PRIVATE].resolvers[key].regExp.test(call)) {
                            return that[PRIVATE].resolvers[key];
                        }
                    }
                }).filter((resolver, index, arr)=>arr.indexOf(resolver) == index);
            },
            executeLocaly(query, run){
                function next(stack, prom){
                    return stack.hasNext() ? run.executeLine(stack.next(), stack).then(()=>next(stack, prom)) : prom;
                }
                return next(new Stack(saveNestedFunctions(query, run).split(";")), Promise.resolve());
            },
            validate(query, params) {
                var buffer = {};
                if(query.length > that[PRIVATE].QUERY_LENGTH) {
                    throw `query length exceeds the limit. limit = ${that[PRIVATE].QUERY_LENGTH}, actual = ${query.length}`
                }
                if(params){
                    Object.keys(params).map(key=>{
                        buffer['$'+key] = params[key];
                    });
                }
                var counter = 0,
                    queryArr = query.replace(/\"([^"]*)\"|\'([^']*)\'/g, (m, str)=>{
                        var index = counter++;
                        buffer[`$_${index}`] = str;
                        return `$_${index}`;
                    }) //save strings
                    .replace(/\s+/g, '')
                    .split(";").filter(el=>el!=="");
                var run = {
                    setVar(key, val) {
                        if(val === undefined) {
                            var index = counter++;
                            buffer[`$_${index}`] = key;
                            return `$_${index}`;
                        }
                        buffer[key] = val;
                    },
                    handle() {
                        return 'res';
                    }
                };
                function reduceLine(line) {
                    try {
                        tools.ops.map(op=>{
                            while(op.regExp.test(line))
                                line = line.replace(op.regExp, function (str){
                                    var args = Object.values(arguments);                                       
                                    args = args.slice(1, args.length - 2).map(arg=>arg && arg.replace(/\$_?[\w\.]+/g, (key)=>{
                                        if(buffer[key.split(".")[0]] === undefined) return key;                                    
                                        var val = tools.lookDeep(key, buffer);
                                        return JSON.stringify(val || 'res');
                                    }));                   
                                    return run.setVar(op.handle(run, args));
                                });
                        });
                        return line;
                    }
                    catch(err) {
                        throw `syntax error in query ${query.replace(/\s+/g, ' ')}; line ${line.replace(/\$_?[\w\.]+/g, key=>{
                            if(buffer[key.split(".")[0]] === undefined) return key;                                    
                            var val = tools.lookDeep(key, buffer);
                            return JSON.stringify(val || 'res');
                        })}`;
                    }
                }
                var resArr = queryArr.map(line=>{
                    while(~line.indexOf("(")) {
                        line =  line.replace(/\(([^\(\)]+)\)/, (m, expr)=>{
                            return reduceLine(expr);
                        });
                    };
                    return reduceLine(line);
                });
                if(Object.keys(buffer).length > that[PRIVATE].VARIABLE_COUNT) {
                    throw `query complexety exceeds the limit. limit = ${that[PRIVATE].VARIABLE_COUNT}, actual = ${buffer.keys(buffer).length}`
                }
                return true;
            }
        }

        this[PRIVATE].handlers = (options && options.handlers) || [];
        this[PRIVATE].resolvers = [{
            id : LOCAL_RESOLVER,
            isLocal : true,
            regExp : (options && options.localResolver && options.localResolver.regExp) || null,
            handle : that[PRIVATE].executeLocaly
        }];
    }
    getLocalResolver() {
        return this[PRIVATE].resolvers.filter(resolver=>resolver.id == LOCAL_RESOLVER)[0]
    }
    delegate(obj){
        this[PRIVATE].resolvers.push({
            id: obj.id || Symbol(),
            regExp : typeof obj.regExp == "string" ? new RegExp(obj.regExp) : obj.regExp,
            handle : obj.handle
        })
        this[PRIVATE].resolvers = this[PRIVATE].resolvers.sort(resolver=>resolver.isLocal ? 1 : -1)
    }
    addHandler(obj){
        if(typeof obj == 'function') {
            obj = {
                id : null,
                handle : obj,
                regExp : new RegExp(obj.name)
            }
        }
        this[PRIVATE].handlers.push({
            id : obj.id || Symbol(),
            regExp : (typeof obj.regExp == "string" ? new RegExp(obj.regExp) : obj.regExp),
            handle : obj.handle
        });
    }
    addHandlers(handlers){
        handlers.forEach(handler=>{
            this.addHandler(handler);
        })
    }
    call(query) {

        var {query, params} = typeof query != "string" ? query : {query: query, params: {}};
        if(typeof query !== 'string' || typeof params !== 'object') {
            throw new Error("Incorect input");
        }
        try {
            this[PRIVATE].validate(query, params);
        } catch(err) {
            Promise.reject(err);
        }
        var run = new Run({query, params}, this[PRIVATE].handlers, this.getLocalResolver(), this[PRIVATE].getResolvers);
        return run.execute();
    }
}

module.exports = Limbo;