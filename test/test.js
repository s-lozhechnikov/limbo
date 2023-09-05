const LQ = require('./../index');
var assert = require('assert');
describe('single instance', ()=>{
    var inst1 = new LQ();
        inst1.addHandlers([
            function m1(p){
                return p;
            },
            function m2(p){
                return Promise.resolve(p);
            },
            function m3(p){
				return {a : p};
			},
            function returnTrue(){
                return true;
            }
        ]);
    it('simple call', ()=>{
        return inst1.call('=>m1~4').then((r)=>{
			assert.equal(r, 4);
		});
    });

    it('method returns promise, using variables', ()=>{
        return inst1.call('$m2 = m2 ~ "bla";\
						$m1 = m1 ~ $m2').then((r)=>{
        assert.equal(JSON.stringify(r), '{"m2":"bla","m1":"bla"}')
		});
    });

    it('returning object', ()=>{
        return inst1.call('=>{"a" : (m1 ~ "bla")}').then((r)=>{
			assert.equal(JSON.stringify(r), '{"a":"bla"}');
		});
    });

    it('property access', ()=>{
        return inst1.call(`\
            $m3 = m3~"bla";
			=>$m3.a
        `).then(r=>{
            assert.equal(r, "bla");
        });  
    });

    it('conditions', ()=>{
        return inst1.call(`
            $m1 = returnTrue~;
			? $m1 @{;
				=>"true"
			} : @{;
				=>"false"
			}`).then(r=>{
				assert.equal(r, "true");
		});
    });

    it('comparing equals==', ()=>{
        return inst1.call(`$a = 2;
		$b = 2;
		? $a == $b @{;
			=>true;
		} : @{;
			=>false;
		}`).then(r=>{
			assert.equal(r, true);
		});
    });

	it('comparing equals ===', ()=>{
        return inst1.call(`$a = "2";
		$aa=2;
		$b = 2;
		? $a === $b @{;
			$c = true;
		} : @{;
			$c = false;
		};
		? $aa === $b @{;
			$d = true;
		} : @{;
			$d = false;
		};
		=>{"c" : $c, "d" : $d};
		`).then(r=>{
			assert.equal(JSON.stringify(r), '{"c":false,"d":true}');
		});
    });
	it('comparing not equals !==', ()=>{
        return inst1.call(`$a = "2";
		$aa=2;
		$b = 2;
		? $a !== $b @{;
			$c = true;
		} : @{;
			$c = false;
		};
		? $aa != $b @{;
			$d = true;
		} : @{;
			$d = false;
		};
		=>{"c" : $c, "d" : $d};
		`).then(r=>{
			assert.equal(JSON.stringify(r), '{"c":true,"d":false}');
		});
    });
	it('comparing equals object properties', ()=>{
        return inst1.call(`$a = {"a" : 2};
		$b = {"b" : 2};
		? $a.a == $b.b @{;
			=>true;
		} : @{;
			=>false;
		}`).then(r=>{
			assert.equal(r, true);
		});
    });

	it('comparing not equals object properties', ()=>{
        return inst1.call(`$a = {"a" : 2};
		$b = {"b" : 2};
		? $a.a != $b.b @{;
			=>true;
		} : @{;
			=>false;
		}`).then(r=>{
			assert.equal(r, false);
		});
    });

    it('negotiation, retruning null', ()=>{
        return inst1.call(`$a = p2 ~;
		? !$a @{;
			=>null;
		} : @{;
			=>"null1"
		};
		=>$a;`).then(r=>{
			assert.equal(r, null);
		});
    });

    it('brackets', ()=>{
        return inst1.call(`=>({"a" : (m1~"bla")})`).then(r=>{
			//console.log(r);
			assert.equal(JSON.stringify(r), '{"a":"bla"}')
		})
    });

	it('logical and', ()=>{
		return inst1.call(`
			$two = 2;
			$three = 3;
			? $two == 2 && $three == 3 @{;
				? $two == 2 && $three != 3 @{;
					=>"incorect";
				} : @{;
					=>"correct"
				};
			} : @{;
				=>"incorect";
			};
		`).then(r=>assert.equal(r, "correct"))
	});

	it('logical or', ()=>{
		return inst1.call(`
			$two = 2;
			$three = 3;
			? $two != 2 || $three != 3 @{;
				=>"incorect"
			} : @{;
				? $two != 2 || $three == 3 @{;
					=>"correct";
				} : @{;
					=>"incorect"
				};
			};
		`).then(r=>assert.equal(r, "correct"))
	});

	it('plus int', ()=>{
		return inst1.call(`
			=>2+1;
		`).then(r=>assert.equal(r, 3))
	});

	it('plus str', ()=>{
		return inst1.call(`
			=>"str1"+"str2";
		`).then(r=>assert.equal(r, "str1str2"))
	});

	it('plus arrs', ()=>{
		return inst1.call(`
			$arr1 = [1,2,3];
			$arr2 = [4,5,6];
			=>$arr1 + $arr2;
		`).then(r=>assert.equal(JSON.stringify(r), "[1,2,3,4,5,6]"))
	});

	it('arr plus num', ()=>{
		return inst1.call(`
			$arr = [1,2,3];
			$num = 4;
			=>$arr + $num;
		`).then(r=>assert.equal(JSON.stringify(r), "[1,2,3,4]"))
	});

	it('num plus arr', ()=>{
		return inst1.call(`
			$arr = [1,2,3];
			$num = 0;
			=>$num + $arr;
		`).then(r=>assert.equal(JSON.stringify(r), "[0,1,2,3]"))
	});
});

describe('delegation', ()=>{
    var inst1 = new LQ(),
			inst2 = new LQ();
		inst1.addHandlers([
			function m1(p){
				return p;
			}
		]);
        inst1.delegate({
			regExp : /^method\d+/,
			handle : (query)=>{
				return inst2.call(query).then(r=>{
					return r;
				});
			}
		});
		inst2.delegate({
			regExp : /m\d+/,
			handle : (query)=>{
				return inst1.call(query);
			}
		});
		inst2.addHandlers([
			function p2(p){
				return p;
			}
		]);

        inst2.addHandler({
			regExp : /^method\d+/,
			handle : (params, methodName)=>{
				return params+2;
			}
		});
    it('simple delegation', ()=>{
        return inst2.call(`
            $m1 = m1 ~ "bla";
			$p2 = p2 ~ $m1;
			=>$p2;
        `).then((r)=>{
			assert.equal(r, 'bla');
		});
    });

    it('delegation with condition', ()=>{
        return inst2.call(`$p1 = p2 ~ 2;
		? $p1 @{;
			$m = m1 ~ 2;
		} : @{;
			$m = 1;
		};
		=>$m`).then((r)=>{
			assert.equal(r, 2);
		});
    });

    it('split line', ()=>{
        return inst2.call(`=>{
			"m" : (m1 ~ 1),
			"method" : (method2 ~ 2)
		}`).then(r=>{
			assert.equal(JSON.stringify(r), '{"m":1,"method":4}');
		});
    });
    
    it('return in condition', ()=>{
        return inst1.call(`? true @{;
			$a = method1 ~ "del";
			=>$a;
		};
		=>m1 ~ "local";
		`).then(r=>{
			assert.equal(r, "del2");
		})
    });

    it('separated params', ()=>{
        return inst1.call({
            query: `
                $m = method1 ~ $arg;
                ? $m @{;
                    $meth = m1 ~ 1;
                    =>{
                        "meth" : $meth,
                        "m" : $m
                    };
                };
            `, 
            params : {"arg" : 2}
        }).then(r=>{
			assert.equal(JSON.stringify(r), '{"meth":1,"m":4}');
		});
    });
});








