function lookDeep(key, obj){
	let path = key.split('.'),
		val = obj;
	for(let i = 0; i < path.length; i++){
		if(!val) {
			break;
		}
		val = val[path[i]];
	}
	return val;
}

module.exports = {
	lookDeep : lookDeep,
	getCalls(line){
		return (line.match(/\w+\~/g) || []).filter((el, index, arr)=>arr.indexOf(el) == index)
			.map(el=>el.replace(/\~/g, '')); 
	},
	getBalance(line){
		return (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
	},
	saveTopLevelFunction(str) {
		var scope = [];
		function process(str) {
			var start = str.indexOf("@{");
			if(start == -1) {
				return str
			}
			let counter = 1,
				current = start+1;
			while(counter != 0) {
				current++;
				counter = counter + ({
					"{" : 1,
					"}" : -1
				}[str[current]] || 0);
			}
			scope.push(str.substr(start+2, current-start-2));
			return str.substr(0, start) + "$"+(scope.length+1) + process(str.substr(current+1));
		}
		var result = process(str);
		return {
			str : result,
			scope : scope
		}
	},
	generateKey(length) {
        var text = "",
            possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        for (var i = 0; i < length; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    },
	ops : [
		{
			regExp : /\!(\$?_?\w+)/, //negative
			handle : (run, args) => {
				return !(args[0] && args[0] !=="undefined" && JSON.parse(args[0]));
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)(\=\=\=?)(\$?_?[\w\.]+)/, //is equal
			handle : (run, args)=>{ 
				return args[1] == "===" ? 
					((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) === (args[2] === 'undefined' ? undefined : JSON.parse(args[2]))) : 
					((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) == (args[2] === 'undefined' ? undefined : JSON.parse(args[2])))
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)(\!\=\=?)(\$?_?[\w\.]+)/, //is unequal
			handle : (run, args)=>{
				return args[1] == "!==" ? 
				((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) !== (args[2] === 'undefined' ? undefined : JSON.parse(args[2]))) : 
				((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) != (args[2] === 'undefined' ? undefined : JSON.parse(args[2])))
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)\+(\$?_?[\w\.]+)/, //plus
			handle : (run, args)=>{
				var arg1 = args[0] === 'undefined' ? undefined : JSON.parse(args[0]),
					arg2 = args[1] === 'undefined' ? undefined : JSON.parse(args[1]);
				if(!Array.isArray(arg1) && !Array.isArray(arg2)) {
					return arg1 + arg2;
				} 
				else if(!Array.isArray(arg1)) {
					arg2.unshift(arg1);
					return arg2;
				}
				else if(!Array.isArray(arg2)) {
					arg1.push(arg2);
					return arg1;
				} 
				else {
					return arg1.concat(arg2);
				}
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)\-(\$?_?[\w\.]+)/, //minus
			handle : (run, args)=>{
				var arg1 = args[0] === 'undefined' ? undefined : JSON.parse(args[0]),
					arg2 = args[1] === 'undefined' ? undefined : JSON.parse(args[1]);
				return arg1 - arg2;
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)\*(\$?_?[\w\.]+)/, //multiply
			handle : (run, args)=>{
				var arg1 = args[0] === 'undefined' ? undefined : JSON.parse(args[0]),
					arg2 = args[1] === 'undefined' ? undefined : JSON.parse(args[1]);
				return arg1 * arg2;
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)\/(\$?_?[\w\.]+)/, //divide
			handle : (run, args)=>{
				var arg1 = args[0] === 'undefined' ? undefined : JSON.parse(args[0]),
					arg2 = args[1] === 'undefined' ? undefined : JSON.parse(args[1]);
				return arg1 / arg2;
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)\&\&(\$?_?[\w\.]+)/, //and
			handle : (run, args)=>{
				return ((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) && (args[1] === 'undefined' ? undefined : JSON.parse(args[1])))
			}
		},
		{
			regExp : /(\$?_?[\w\.]+)\|\|(\$?_?[\w\.]+)/, //or
			handle : (run, args)=>{
				return ((args[0] === 'undefined' ? undefined : JSON.parse(args[0])) || (args[1] === 'undefined' ? undefined : JSON.parse(args[1])))
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
}