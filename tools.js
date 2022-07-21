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
    }
}