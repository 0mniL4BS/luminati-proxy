// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const _ = require('lodash');
const string = require('./string.js');
const {qw} = string;
const HTTPParser = process.binding('http_parser').HTTPParser;
const semver = require('semver');
const node_v12 = semver.gte(process.version, '12.0.0');
const E = exports, assign = Object.assign;

const special_case_words = {
    te: 'TE',
    etag: 'ETag',
};

E.capitalize = function(headers){
    let res = {};
    for (let header in headers)
    {
        let new_header = header.toLowerCase().split('-').map(word=>{
            return special_case_words[word] ||
                (word.length ? word[0].toUpperCase()+word.substr(1) : '');
        }).join('-');
        res[new_header] = headers[header];
    }
    return res;
};

// original_raw should be the untransformed value of rawHeaders from the
// Node.js HTTP request or response
E.restore_case = function(headers, original_raw){
    if (!original_raw)
        return headers;
    const names = {};
    for (let i = 0; i<original_raw.length; i += 2)
    {
        const name = original_raw[i];
        names[name.toLowerCase()] = [name];
    }
    for (let orig_name in headers)
    {
        const name = orig_name.toLowerCase();
        if (names[name])
            names[name].push(orig_name);
        else
            names[name] = [orig_name];
    }
    const res = {};
    for (let name in names)
    {
        const value = names[name].map(n=>headers[n]).filter(v=>v)[0];
        if (value!==undefined)
            res[names[name][0]] = value;
    }
    return res;
};

// default header values
// XXX josh: upgrade-insecure-requests might not be needed on 2nd request
// onwards
E.browser_defaults = function(browser, opt){
    opt = opt||{};
    let defs = {
        chrome: {
            connection: 'keep-alive',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
            'upgrade-insecure-requests': '1',
            'accept-encoding': 'gzip, deflate',
            'accept-language': 'en-US,en;q=0.9',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36',
        },
        chrome_https: {
            'accept-encoding': 'gzip, deflate, br',
        },
        chrome_sec_fetch: {
            'sec-fetch-mode': 'navigate',
            'sec-fetch-user': '?1',
            'sec-fetch-site': 'none',
        },
        mobile_chrome: {
            'user-agent': 'Mozilla/5.0 (Linux; Android 9; MBOX) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US,en;q=0.9',
        },
        mobile_chrome_sec_fetch: {
            'sec-fetch-mode': 'navigate',
            'sec-fetch-user': '?1',
            'sec-fetch-site': 'none',
        },
        firefox: {
            connection: 'keep-alive',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'upgrade-insecure-requests': '1',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US,en;q=0.5',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:67.0) Gecko/20100101 Firefox/67.0',
        },
        edge: {
            connection: 'keep-alive',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'upgrade-insecure-requests': '1',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763',
        },
        safari: {
            connection: 'keep-alive',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'upgrade-insecure-requests': '1',
            'accept-encoding': 'br, gzip, deflate',
            'accept-language': 'en-us',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0.3 Safari/605.1.15',
        },
        mobile_safari: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.1 Mobile/15E148 Safari/604.1',
            'accept-language': 'en-us',
            referer: '',
        },
    };
    if (opt.override)
        defs = assign({}, defs, opt.override);
    let result = defs[browser];
    if (!result)
    {
        result = defs.chrome;
        browser = 'chrome';
    }
    if ({chrome: 1, mobile_chrome: 1}[browser] && opt.https)
    {
        result = assign(result, defs[browser+'_https'],
            opt.major>75 ? defs[browser+'_sec_fetch'] : {});
    }
    return result;
};

E.browser_accept = function(browser, type){
    let defs = {
        document: {
            chrome: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
            mobile_chrome: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
            firefox: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            edge: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            safari: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            mobile_safari: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        image: {
            chrome: 'image/webp,image/apng,image/*,*/*;q=0.8',
            firefox: 'image/webp,*/*',
            safari: '*/*',
        },
        video: {
            chrome: '*/*',
            firefox: 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        },
        audio: {
            chrome: '*/*',
            firefox: 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
            safari: '*/*',
        },
        script: {
            chrome: '*/*',
            firefox: '*/*',
            safari: '*/*',
        },
        css: {
            chrome: 'text/css,*/*;q=0.1',
            firefox: 'text/css,*/*;q=0.1',
            safari: 'text/css,*/*;q=0.1',
        },
    };
    let kind = defs[type]||defs.document;
    return kind[browser]||kind.chrome;
};

const header_rules = [
    // http1 rules
    {match: {browser: 'chrome'},
        rules: {order: qw`host connection pragma cache-control
            upgrade-insecure-requests user-agent sec-fetch-mode sec-fetch-user
            accept sec-fetch-site referer accept-encoding accept-language
            cookie`}},
    {match: {browser: 'chrome', type: 'xhr'},
        rules: {order: qw`host connection pragma cache-control accept
            x-requested-with user-agent sec-fetch-mode content-type
            sec-fetch-site referer accept-encoding accept-language cookie`}},
    {match: {browser: 'chrome', version_min: 78},
        rules: {order: qw`host connection pragma cache-control origin
            upgrade-insecure-requests user-agent sec-fetch-user accept
            sec-fetch-site sec-fetch-mode accept-encoding accept-language
            cookie`}},
    {match: {browser: 'chrome', version_min: 78, type: 'xhr'},
        rules: {order: qw`host connection pragma cache-control accept
            x-requested-with user-agent content-type sec-fetch-site
            sec-fetch-mode referer accept-encoding accept-language cookie`}},
    {match: {browser: 'mobile_chrome'},
        rules: {order: qw`host connection pragma cache-control
            upgrade-insecure-requests user-agent sec-fetch-mode sec-fetch-user
            accept sec-fetch-site referer accept-encoding accept-language
            cookie`}},
    {match: {browser: 'mobile_chrome', version_min: 78},
        rules: {order: qw`host connection pragma cache-control
            upgrade-insecure-requests user-agent sec-fetch-user
            accept sec-fetch-site sec-fetch-mode referer accept-encoding
            accept-language cookie`}},
    {match: {browser: 'firefox'},
        rules: {order: qw`host user-agent accept accept-language
            accept-encoding referer connection cookie
            upgrade-insecure-requests cache-control`}},
    {match: {browser: 'edge'},
        rules: {order: qw`referer cache-control accept accept-language
            upgrade-insecure-requests user-agent accept-encoding host
            connection`}},
    {match: {browser: 'safari'},
        rules: {order: qw`host cookie connection upgrade-insecure-requests
            accept user-agent referer accept-language accept-encoding`}},
    {match: {browser: 'mobile_safari'},
        rules: {order: qw`host connection accept user-agent accept-language
            referer accept-encoding`}},
    // http2 rules
    {match: {browser: 'chrome', http2: true},
        rules: {order: qw`:method :authority :scheme :path pragma
            cache-control upgrade-insecure-requests user-agent sec-fetch-mode
            sec-fetch-user accept sec-fetch-site referer accept-encoding
            accept-language cookie`}},
    {match: {browser: 'chrome', http2: true, type: 'xhr'},
        rules: {order: qw`:method :authority :scheme :path pragma cache-control
            accept x-requested-with user-agent sec-fetch-mode content-type
            sec-fetch-site referer accept-encoding accept-language cookie`}},
    {match: {browser: 'chrome', http2: true, version_min: 78},
        rules: {order: qw`:method :authority :scheme :path pragma cache-control
            origin upgrade-insecure-requests user-agent sec-fetch-user accept
            sec-fetch-site sec-fetch-mode referer accept-encoding
            accept-language cookie`}},
    {match: {browser: '', http2: true, version_min: 78, type: 'xhr'},
        rules: {order: qw`:method :authority :scheme :path pragma
            cache-control accept x-requested-with user-agent content-type
            sec-fetch-site sec-fetch-mode referer accept-encoding
            accept-language cookie`}},
    {match: {browser: 'mobile_chrome', http2: true},
        rules: {order: qw`:method :authority :scheme :path pragma cache-control
            upgrade-insecure-requests user-agent sec-fetch-mode sec-fetch-user
            accept sec-fetch-site referer accept-encoding
            accept-language cookie`}},
    {match: {browser: 'mobile_chrome', http2: true, version_min: 78},
        rules: {order: qw`:method :authority :scheme :path pragma
            cache-control upgrade-insecure-requests user-agent sec-fetch-user
            accept sec-fetch-site sec-fetch-mode referer accept-encoding
            accept-language cookie`}},
    {match: {browser: 'firefox', http2: true},
        rules: {order: qw`:method :path :authority :scheme user-agent accept
            accept-language accept-encoding referer cookie
            upgrade-insecure-requests cache-control te`}},
    {match: {browser: 'edge', http2: true},
        rules: {order: qw`:method :path :authority :scheme referer
            cache-control accept accept-language upgrade-insecure-requests
            user-agent accept-encoding cookie`}},
    {match: {browser: 'safari', http2: true},
        rules: {order: qw`:method :scheme :path :authority cookie accept
            accept-encoding user-agent accept-language referer`}},
    {match: {browser: 'mobile_safari', http2: true},
        rules: {order: qw`:method :scheme :path :authority cookie accept
            accept-encoding user-agent accept-language referer`}},
];

function is_browser_supported(browser){
    return qw`chrome firefox edge safari mobile_chrome mobile_safari`
        .includes(browser);
}

E.browser_default_header_order = function(browser, opt){
    opt = opt||{};
    if (!is_browser_supported(browser))
        browser = 'chrome';
    return select_rules(header_rules, {
        browser: browser,
        version: opt.major,
        type: opt.req_type,
    }).order;
};

E.like_browser_case_and_order = function(headers, browser, opt){
    let ordered_headers = {};
    let source_header_keys = Object.keys(headers);
    if (source_header_keys.find(h=>h.toLowerCase()=='x-requested-with'))
        opt = assign({req_type: 'xhr'}, opt);
    let header_keys = E.browser_default_header_order(browser, opt);
    for (let header of header_keys)
    {
        let value = headers[source_header_keys
            .find(h=>h.toLowerCase()==header)];
        if (value)
            ordered_headers[header] = value;
    }
    for (let header in headers)
    {
        if (!header_keys.includes(header))
            ordered_headers[header] = headers[header];
    }
    return E.capitalize(ordered_headers);
};

E.browser_default_header_order_http2 = function(browser, opt){
    opt = opt||{};
    if (!is_browser_supported(browser))
        browser = 'chrome';
    return select_rules(header_rules, {
        browser: browser,
        version: opt.major,
        type: opt.req_type,
        http2: true,
    }).order;
};

// reverse pseudo headers (e.g. :method) because nodejs reverse it
// before send to server
// https://github.com/nodejs/node/blob/v12.x/lib/internal/http2/util.js#L473
function reverse_http2_pseudo_headers_order(headers){
  let pseudo = {};
  let other = Object.keys(headers).reduce((r, h)=>{
      if (h[0]==':')
          pseudo[h] = headers[h];
      else
          r[h] = headers[h];
      return r;
  }, {});
  pseudo = Object.keys(pseudo).reverse()
      .reduce((r, h)=>{ r[h] = pseudo[h]; return r; }, {});
  return Object.assign(pseudo, other);
}

E.like_browser_case_and_order_http2 = function(headers, browser, opt){
    let ordered_headers = {};
    if (Object.keys(headers).find(h=>h.toLowerCase()=='x-requested-with'))
        opt = assign({req_type: 'xhr'}, opt);
    let header_keys = E.browser_default_header_order_http2(browser, opt);
    let req_headers = {};
    for (let h in headers)
        req_headers[h.toLowerCase()] = headers[h];
    for (let h of header_keys)
    {
        if (req_headers[h])
            ordered_headers[h] = req_headers[h];
    }
    for (let h in req_headers)
    {
        if (!header_keys.includes(h))
           ordered_headers[h] = req_headers[h];
    }
    return reverse_http2_pseudo_headers_order(ordered_headers);
};

let parser = new HTTPParser(HTTPParser.REQUEST), parser_usages = 0;
E.parse_request = buffer=>{
    let ret;
    parser[HTTPParser.kOnHeadersComplete] =
        (version_major, version_minor, raw_headers, method, url, status_code,
        status_message, upgrade, should_keep_alive)=>
        ret = {version_major, version_minor, raw_headers, method, url,
            upgrade, should_keep_alive};
    if (node_v12)
        parser.initialize(HTTPParser.REQUEST, {});
    else
    {
        parser.reinitialize(HTTPParser.REQUEST, !!parser_usages);
        parser_usages++;
    }
    let exec_res = parser.execute(buffer);
    if (exec_res instanceof Error)
        throw exec_res;
    if (!ret)
        return;
    // ugly, not 100% accurate, but fast!
    ret.headers = {};
    for (let i=0; i<ret.raw_headers.length; i+=2)
        ret.headers[ret.raw_headers[i].toLowerCase()] = ret.raw_headers[i+1];
    return ret;
};

E.to_raw_headers = function(headers){
    let raw_headers = [];
    for (let name in headers)
    {
        if (Array.isArray(headers[name]))
        {
            for (let value of headers[name])
                raw_headers.push(name, value);
        }
        else
            raw_headers.push(name, headers[name]);
    }
    return raw_headers;
};

function select_rules(all_rules, selector){
    let matches = all_rules.filter(x=>matches_rule(x.match, selector));
    return _.merge({}, ...matches.map(x=>x.rules), (dest, src)=>{
        if (Array.isArray(src))
            return src;
    });
}

function matches_rule(rule, data){
    for (let k in rule)
    {
        if (k=='version_min')
        {
            if ((rule[k]||0)>(data.version||0))
                return false;
        }
        else if (rule[k]!=data[k])
            return false;
    }
    return true;
}

E.t = {header_rules, select_rules};
