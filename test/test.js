const path = require('path')
const checker = require('../index')
const {expect} = require('chai')


describe('link checker', () => {
	it('run link checker with simple fixtures', (done) => {
		const fixtureSimple = path.join(__dirname, 'fixture-simple')
		checker(fixtureSimple, {['warn-name-attr']: true}, (err, result) => {
			expect(err).to.not.exist
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
			done()
		})
	})

	it('run link checker with scaladoc fixtures', (done) => {
		const fixtureSimple = path.join(__dirname, 'fixture-scaladoc')
		checker(fixtureSimple, {javadoc: true}, (err, result) => {
			expect(err).to.not.exist
			const expectedErrors = [{
				type: 'page',
			    target: 'com/organization/NotExistingClass.html',
			    source: 'index.html',
			    reason: 'page not found' },
			  { type: 'anchor',
			    target: 'com/organization/Baz.html#not-existing-anchor',
			    anchor: 'not-existing-anchor',
			    source: 'index.html',
			    reason: 'anchor not found' 
			}]
			const expectedWarnings = []

			expect(result.stats.errors).eql(expectedErrors)
			expect(result.stats.warnings).eql(expectedWarnings)
			expect(result.stats).eql({
				parsedFiles: 4,
				localLinks: 4,
				localAnchorLinks: 2,
				remoteLinks: 0,
				remoteAnchorLinks: 0,
				parentLinks: 0,
				parentAnchorLinks: 0,
				errors: expectedErrors,
				warnings: expectedWarnings
			})
			done()
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
	// TODO anchor like `::%5BA%5D=scala.collection.immutable.::%5BA%5D` -> `::[A]=scala.collection.immutable.::[A]`
	// TODO scaladoc: `index.html?serialized-form.html` contains .html at the end in the querystring
})
