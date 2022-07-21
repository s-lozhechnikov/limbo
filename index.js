
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
            handle : obj.handle,
            define : obj.define
        });
    }
    addHandlers(handlers){
        handlers.forEach(handler=>{
            this.addHandler(handler);
        })
    }
    call(query) {
        if(typeof query != "string") {
            throw new Error(`Query must be string. ${typeof query} is providedcons`);
        }
        var run = new Run(query, this[PRIVATE].handlers, this.getLocalResolver(), this[PRIVATE].getResolvers);
        return run.execute();
    }
}

module.exports = Limbo;