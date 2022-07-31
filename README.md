# limbo
Limbo js is a proof of concept of the method oriented API approach. It allows as to define and delegate methods which then can be called via special query language. One query can be executed by several resolvers chunk by chunk. The query gets splitted into chunks based on defeined resolvers - one chunk can have only one resolver. 


### addHandler (options : Object)
Adds a method handler. The "options" parameter consists of next elements:
1. regExp : RegExp. Methods which match to the regexp will be processed by current handler
2. handle : Function(params, method). defines the handler for the method.
```javascript
  const Limbo = require("limbo");
  const instance = new Limbo();
  instance.addHandler({
    regExp : /method\d*/,
    handle : (params)=>{
      return {success : true}
    }
  })
```
### delegate(options : Object)
Adds a resolver which will be applied to the query or subquery if it calls certan method(s). The "options" parameter consists of next elements:
1. regExp : RegExp. The (sub)query will be resolved by current resolver if it calls method that match the regexp
2. handle : Function(query : String) The resolver function;
```javascript
  const Limbo = require("limbo");
  const instance = new Limbo();
  instance.delegate({regExp : /.+/, handle : query=>{
    var headers = {
        "Content-Type" : "application/json"
    };
    return fetch("/limbo", {
        method : "POST",
        headers : headers,
        body : JSON.stringify({query : query})
    }).then(resp=>{
        return resp && resp.json();
    }).catch(err=>{
        throw err;
    });
  }});
```
### call(query : String)
executes passed query
```javascript
  instance.call(`
    $loginStatus = user_login ~ ${JSON.stringify(data)};
    ? $loginStatus.success @{;
      $sid = user_getSID ~;
      $userData = user_getDashboard ~;
      =>{"userData" : $userData, "sid" : $sid, "success" : true};
    } : @{;
      ? $loginStatus.error == "user_not_confirm" @{;
        user_sendConfirm ~ {"email" : "${data.email}"};
      }
      =>$loginStatus
    }
  `)
```

## Query syntax
The language consists of next operator:
### Assign. 
Assigns value at the right to the variable at the left. All variable names should start with "$".
`` 
$obj = "val";
``
### Call
Calls method. Only one parameter can be passed to the called method however this one paramer can be an object or an array. Te result can be assign to a variable or returned;
``
$result = method ~ {"key" : "val"};
``
### Return
Ends query execution and returns the value
``
=> $result;
``
### Condition
Executes a subqery based on condtion
``
? $result.success == true @{;
  =>result;
} : @{;
  =>{"success" : false, "error" : "error during executing 'method'"}
}
``

