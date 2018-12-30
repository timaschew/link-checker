# Link Checker

Link checker for HTML pages which checks `href` attributes including the anchor in the target.  
The Command Line Interface expects a directory on your local file system which will be scanned.

**Why did I wrote this tool?**

I was using a nice CLI called [html-proofer](https://github.com/gjtorikian/html-proofer), but was using a preprocessing step in order to get Javadoc and Scaladoc working because of the iframe setup. At some point it didn't scale anymore. Scaladoc link checker with html-proofer took 5 minutes.

`link-checker` is using [cheerio](https://github.com/cheeriojs/cheerio) for parsing HTML, which is using the fastest HTML parser for Node.js: [htmlparser2](https://github.com/fb55/htmlparser2). Same Scaladoc which took 5 minutes with html-proofer takes now 5 seconds with `link-checker`. Also URL transformation for iframes can be turned on on-the-fly via `--javadoc`. In this mode links like `/index.html#com.org.company.product.library.Main@init` will check for a HTML in the path`com/org/company/product/library/Main.html` and the anchor `init`.

## FAQ

##### I need to check links on a website via http(s)
Just use a [website-scraper](https://github.com/website-scraper/node-website-scraper) and download all the pages
to your file system.

I've used the module with this options:

```javascript
{
  urls: [urlToScrape],
  directory: outputDirectory,
  recursive: true,
  filenameGenerator: 'bySiteStructure',
  urlFilter: function(url) {
      return url.indexOf(urlToScrape) != -1;
  }
}
```

## Installation

### NPM
You can install it via npm

```
npm install -g link-checker
```

You can also install it without `-g` but then you need to put the binary,
located in `node_modules/.bin/link-checker` to your `$PATH`.

### Docker
https://hub.docker.com/r/timaschew/link-checker/

```
docker pull timaschew/link-checker
```

## Usage

```
You need to pass exactly one path where to check links
Usage: link-checker path [options]

Options:
  --version             Show version number                            [boolean]
  --allow-hash-href     If `true`, ignores the `href` `#`              [boolean]
  --disable-external    disable checks remote links                    [boolean]
  --external-only       check remote links only                        [boolean]
  --file-ignore         RegExp to ignore files to scan                   [array]
  --url-ignore          RegExp to ignore URLs                            [array]
  --url-swap            RegExp for URLs which can be replaced on the fly [array]
  --limit-scope         forbid to follow URLs which are out of provided path,
                        like ../somewhere                              [boolean]
  --mkdocs              transforming URLS from foo/#bar to foo/index.html#bar
                                                                       [boolean]
  --javadoc             Enable special URL transforming which allows to check
                        iframe deeplinks for local javadoc and scaladoc[boolean]
  --javadoc-external    Domain or base URL to do URL transformation to check
                        iframe deeplinks                                 [array]
  --http-status-ignore  pass HTTP status code which will be ignore, by default
                        only 2xx are allowed                             [array]
  --json                print errors as JSON                           [boolean]
  --http-redirects      Amount of allowed HTTP redirects            [default: 0]
  --http-timeout        HTTP timeout in milliseconds             [default: 5000]
  --http-always-get     Use always HTTP GET requests, by default HEAD is used
                        for pages without any anchors                  [boolean]
  --warn-name-attr      show warning if name attribute instead of id was used
                        for an anchor                                  [boolean]
  -h, --help            Show help                                      [boolean]

Examples:
  link-checker path/to/html/files  checks directory with HTMLfiles for broken
                                   links and anchors
```
