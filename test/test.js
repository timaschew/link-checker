const path = require('path')
const checker = require('../link-checker-promise')
const {expect} = require('chai')


function dir(fixtureDirectory) {
	return path.join(__dirname, `fixture-${fixtureDirectory}`)
}

describe('link checker', () => {

	it.skip('TODO: ignores external URLs', () => {
		return checker(dir('disable-external'), {['disable-external']: true}).then(console.log)
	})

	it('run link checker with simple fixtures', () => {
		return checker(dir('simple'), {['warn-name-attr']: true}).then(result => {
			const expectedErrors = [ {
				type: 'page',
			    target: 'page-d.html',
			    source: 'index.html',
			    reason: 'page not found' },
			  { type: 'anchor',
			    target: 'page-c.html#anchor-99',
			    anchor: 'anchor-99',
			    source: 'index.html',
			    reason: 'anchor not found' } ]
			const expectedWarnings = [{
				type: 'anchor',
				content: 'anchor-name-15',
				source: 'page-b.html',
				reason: 'name attribute was used instead of id'
			}]

			expect(result.stats.errors).eql(expectedErrors)
			expect(result.stats.warnings).eql(expectedWarnings)
			expect(result.stats).eql({
				parsedFiles: 4,
				localLinks: 3,
				localAnchorLinks: 5,
				remoteLinks: 0,
				remoteAnchorLinks: 0,
				parentLinks: 0,
				parentAnchorLinks: 0,
				errors: expectedErrors,
				warnings: expectedWarnings
			})
		})
	})

	it('run link checker with root-relative-url fixtures', () => {
		return checker(dir('root-relative-url'), {['warn-name-attr']: true}).then(result => {
			const expectedErrors = []
			const expectedWarnings = []

			expect(result.stats.errors).eql(expectedErrors)
			expect(result.stats.warnings).eql(expectedWarnings)
			expect(result.stats).eql({
				parsedFiles: 2,
				localLinks: 1,
				localAnchorLinks: 0,
				remoteLinks: 0,
				remoteAnchorLinks: 0,
				parentLinks: 0,
				parentAnchorLinks: 0,
				errors: expectedErrors,
				warnings: expectedWarnings
			})
		})
	})

	it('run link checker with scaladoc fixtures', () => {
		return checker(dir('scaladoc'), {javadoc: true}).then(result => {
			const expectedErrors = [ { type: 'page',
			    target: 'com/organization/NotExistingClass.html',
			    source: 'serialized-form.html',
			    reason: 'page not found' },
			  { type: 'anchor',
			    target: 'com/organization/Baz.html#not-existing-anchor',
			    anchor: 'not-existing-anchor',
			    source: 'serialized-form.html',
			    reason: 'anchor not found' },
			  { type: 'anchor',
			    target: 'serialized-form.html#com/organization/Foobar.html',
			    anchor: 'com/organization/Foobar.html',
			    source: 'serialized-form.html',
			    reason: 'anchor not found' } ]
			const expectedWarnings = []
			expect(result.stats.errors).eql(expectedErrors)
			expect(result.stats.warnings).eql(expectedWarnings)
			expect(result.stats).eql({
				warnings: expectedWarnings,
				parsedFiles: 5,
				localLinks: 4,
				localAnchorLinks: 4,
				remoteLinks: 0,
				remoteAnchorLinks: 0,
				parentLinks: 0,
				parentAnchorLinks: 0,
				errors: expectedErrors
			})
		})
	})

	it('url decoded link', () => {
		return checker(dir('url-decoded')).then(result => {
			expect(result.stats).eql({
      			"errors": [],
      			"localAnchorLinks": 1,
      			"localLinks": 0,
      			"parentAnchorLinks": 0,
      			"parentLinks": 0,
      			"parsedFiles": 1,
      			"remoteAnchorLinks": 1,
      			"remoteLinks": 1,
      			"warnings": []
			})
		})
	})

	it('without file extension', () => {
		return checker(dir('no-extension')).then(result => {
			expect(result.stats).eql({
      			"errors": [],
      			"localAnchorLinks": 0,
      			"localLinks": 1,
      			"parentAnchorLinks": 0,
      			"parentLinks": 0,
      			"parsedFiles": 2,
      			"remoteAnchorLinks": 0,
      			"remoteLinks": 0,
      			"warnings": []
			})
		})
    })
    
    it('Uses link-specific overrides from options', () => {
		return checker(dir('external-host-config'), {
            overrides: {
                "marketplace\\.visualstudio\\.com": {
                    "http-always-get": true
                },
                "www\\.google\\.com/#": {
                    "allow-hash-href": true
                }
            }
        }).then(result => {
			expect(result.stats).eql({
      			"errors": [],
      			"localAnchorLinks": 0,
      			"localLinks": 0,
      			"parentAnchorLinks": 0,
      			"parentLinks": 0,
      			"parsedFiles": 1,
      			"remoteAnchorLinks": 1,
      			"remoteLinks": 2,
      			"warnings": []
			})
		})
    })

	// TODO: use case: anchor including multiple hashtags (scaladoc)
	// TODO: use case: anchor with relative link (scaladoc)
	/*
		#me (on page-a.html)
		../page-a#me (on page-a.html)
	*/
	// TODO: url encoded links
	// TODO: <a xlink:href="..."> (scaladoc)
	// TODO: . (ignore)
	// TODO: ../ (auto append index.html)
	// TODO: href="javascript:foobar"
	// TOOD anchor like `addTask(task:com.here.platform.data.processing.driver.DriverTask):DriverBuilder.this.type`
	// TODO scaladoc: `index.html?serialized-form.html` contains .html at the end in the querystring
})
