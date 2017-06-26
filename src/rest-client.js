import _forIn from 'lodash/forIn'
import _filter from 'lodash/filter'
import _merge from 'lodash/merge'
import _property from 'lodash/property'
import {expect} from 'chai'
import Yadda from 'yadda'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import {utils} from './util/storage'

const English = Yadda.localisation.English
const dictionary = new Yadda.Dictionary()

dictionary
  .define('json', /([^\u0000]*)/, function (data, done) {
    done(null, data)
  })
  .define('text', /([^\u0000]*)/, function (data, done) {
    done(null, data)
  })
  .define('num', /(\d+)/, Yadda.converters.integer)

const testHost = 'http://127.0.0.1:8080'

function client (context) {
  if (!context.client) {
    context.client = request.agent(testHost)
  }
  return context.client
}

function doRequest (context, method, endpoint, next) {
  let agent = client(context)
  let url = utils.template(endpoint, utils.data(context))
  let localUrl = url.replace(testHost, '')
  if (process.env.DEBUG_REST) {
    console.log('>', method, localUrl)
  }
  let request = context.request = agent[method.toLowerCase()](localUrl)
  _forIn(utils.header(context), function (value, name) {
    request.set(name, value)
  })
  if (!context.rawBody) {
    let body = utils.template(context.body, utils.data(context))
    request.send(JSON.stringify(JSON.parse('{' + body + '}')))
  } else {
    request.send(context.body)
  }
  request.end(function (error, response) {
    if (process.env.DEBUG_REST) {
      if (response && response.statusCode) {
        console.log('<', response.statusCode)
        if (response.statusCode >= 400 || process.env.DEBUG_RESPONSE) {
          if (response.statusCode === 401) {
            if (response.headers['www-authenticate']) console.log('<', 'www-authenticate:', response.headers['www-authenticate'])
          }
          console.log(response.body)
        }
      }
    }
    context.response = response
    context.error = error
    next()
  })
}

const tokenContext = 'https://tools.ietf.org/html/rfc7519'
let jwtTokenStore

function checkJwtProperty (context, type, value, next) {
  const token = utils.data(context, jwtTokenStore)
  expect(token.$context).to.equal(tokenContext)
  jwt.verify(token._token, context.$app.config.get('public_key'), function (err, decoded) {
    if (err) {
      next(err)
    }
    try {
      if (typeof value === 'function') {
        value(decoded[type])
      } else {
        expect(decoded[type]).to.equal(value)
      }
    } catch (err) {
      next(err)
    }
  })
  next()
}

const checkReference = (context, data, subject, $id) => {
  expect(data.$context).to.equal('https://github.com/RHeactorJS/models#Reference')
  subject = utils.template(subject, utils.data(context))
  $id = utils.template($id, utils.data(context))
  expect(data.subject).to.equal(subject)
  expect(data.$id).to.equal($id)
}

/**
 * @param {Object} list
 * @param {String} itemContext
 * @param {Number} num
 * @param {Number} total
 */
const checkList = (list, itemContext, num, total) => {
  expect(list, 'The list should not be undefined').to.not.equal(undefined)
  expect(list.$context, 'The $context of a list should be defined').to.equal('https://github.com/RHeactorJS/models#List')
  if (total !== undefined) expect(list.total, `The list should have ${total} items`).to.equal(+total)
  if (num !== undefined) expect(list.items.length, `The items array should have ${num} elements`).to.equal(+num)
  list.items.map(item => {
    expect(item.$context, `The $context of each item should be ${itemContext}`).to.equal(itemContext)
  })
}

export const RestClientContext = {
  beforeScenario: (context) => {
    context.body = undefined
    context.header = {}
  },
  library: English.library(dictionary)

    .given('"$value" is the $header header', function (value, name, next) {
      const context = this.ctx
      utils.header(context, name, utils.template(value, utils.data(context)))
      next()
    })

    .given('the $header header is empty', function (name, next) {
      const context = this.ctx
      utils.header(context, name, undefined)
      next()
    })

    .given('this is the request body\n$json', function (json, next) {
      const context = this.ctx
      context.body = json
      next()
    })

    .given('this JSON is the request body\n$json', function (json, next) {
      const context = this.ctx
      context.body = JSON.stringify(JSON.parse(`{${json}}`))
      context.rawBody = true
      next()
    })

    .given('the request body is empty', function (next) {
      const context = this.ctx
      context.body = undefined
      next()
    })

    .when('I $method to $endpoint', function (method, endpoint, next) {
      const context = this.ctx
      doRequest(context, method, endpoint, next)
    })

    .when('I $method $endpoint', function (method, endpoint, next) {
      const context = this.ctx
      doRequest(context, method, endpoint, next)
    })

    .when('I store "$node" as "$storage"', function (node, storage, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      utils.data(context, storage, data)
      next()
    })

    .when('I store "$node" of the ([0-9]+)[a-z]+ item as "$storage"', function (node, num, storage, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body.items[num - 1])
      utils.data(context, storage, data)
      next()
    })

    .when('I store the link to the list "$context" as "$storage"', function ($context, storage, next) {
      const context = this.ctx
      let matched = _filter(context.response.body.$links, (link) => {
        return link.list && link.subject === $context
      })
      utils.data(context, storage, matched[0].href)
      next()
    })

    .when('I store the link to the list "$context" of the ([0-9]+)[a-z]+ item as "$storage"', function ($context, num, storage, next) {
      const context = this.ctx
      let matched = _filter(context.response.body.items[num - 1].$links, (link) => {
        return link.list && link.subject === $context
      })
      utils.data(context, storage, matched[0].href)
      next()
    })

    .when(/I store the link to "([^"]+)" as "([^"]+)"/, function (relation, storage, next) {
      const context = this.ctx
      let matched = _filter(context.response.body.$links, (link) => {
        return link.rel === relation
      })
      utils.data(context, storage, matched[0].href)
      next()
    })

    .when(/I store the link to "([^"]+)" of "([^"]+)" as "([^"]+)"/, function (relation, node, storage, next) {
      const context = this.ctx
      let matched = _filter(_property(node)(context.response.body).$links, (link) => {
        return link.rel === relation
      })
      utils.data(context, storage, matched[0].href)
      next()
    })

    .when('I store the link of "$relatedContext" as "$storage"', function (relatedContext, storage, next) {
      const context = this.ctx
      let matched = _filter(context.response.body.$links, (link) => {
        return link.subject === relatedContext
      })
      utils.data(context, storage, matched[0].href)
      next()
    })

    .when('I store the link to "$relation" of the ([0-9]+)[a-z]+ item as "$storage"', function (relation, num, storage, next) {
      const context = this.ctx
      let matched = _filter(context.response.body.items[num - 1].$links, (link) => {
        return link.rel === relation
      })
      utils.data(context, storage, matched[0].href)
      next()
    })

    // And "user" of the 1st item should reference the "https://github.com/RHeactorJS/models#User" with $id "{jwt.sub}"
    .then(/"([^"]+)" of the ([0-9]+)[a-z]+ item should reference the "([^"]+)" with id "([^"]+)"/, function (node, num, subject, $id, next) {
      const context = this.ctx
      const item = context.response.body.items[num - 1]
      expect(item, `item "${num}" should exist in the list`).to.not.equal(undefined)
      const data = _property(node)(item)
      expect(data, `"${node}" should be defined on the item`).to.not.equal(undefined)
      checkReference(context, data, subject, $id)
      next()
    })

    // And "user" should reference the "https://github.com/RHeactorJS/models#User" with $id "{jwt.sub}"
    .then(/"([^"]+)" should reference the "([^"]+)" with id "([^"]+)"/, function (node, subject, $id, next) {
      const context = this.ctx
      const data = context.response.body[node]
      expect(data, `"${node}" should be defined on the body`).to.not.equal(undefined)
      checkReference(context, data, subject, $id)
      next()
    })

    .when('I store the $header header as "$storage"', function (header, storage, next) {
      const context = this.ctx
      utils.data(context, storage, context.response.header[header.toLowerCase()])
      next()
    })

    .when('I follow the redirect', function (next) {
      const context = this.ctx
      let agent = client(context)
      expect(context.response.header.location, 'Location header not present').to.not.equal(undefined)
      let request = context.request = agent.get(context.response.header.location.replace(testHost, ''))
      _forIn(utils.header(context), function (value, name) {
        request.set(name, value)
      })
      request.send()
      request.end(function (error, response) {
        context.response = response
        context.error = error
        next()
      })
    })

    .then('the status code should be $num', function (status, next) {
      const context = this.ctx
      if (!context.response) {
        return next(new Error('No HTTP response received from\nRequest:  ' + context.request.method + ' ' + context.request.url))
      }
      try {
        expect(context.response.statusCode).to.equal(status)
        next()
      } catch (err) {
        next(new Error('Unexpected HTTP response status\nExpected: ' + status + '\nGot:      ' + context.response.statusCode + '\nRequest:  ' + context.request.method + ' ' + context.request.url))
      }
    })

    .then('the $header header should equal "$value"', function (name, value, next) {
      const context = this.ctx
      expect(context.response.header[name.toLowerCase()]).to.equal(value)
      next()
    })

    .then('the $header header should exist', function (name, next) {
      const context = this.ctx
      expect(context.response.header[name.toLowerCase()]).to.not.equal(undefined)
      next()
    })

    .then('"$node" should equal "$value"', function (node, value, next) {
      const context = this.ctx
      value = utils.template(value, utils.data(context))
      const data = _property(node)(context.response.body)
      expect(data).to.equal(value)
      next()
    })

    .then('"$node" should not equal "$value"', function (node, value, next) {
      const context = this.ctx
      value = utils.template(value, utils.data(context))
      const data = _property(node)(context.response.body)
      expect(data).to.not.equal(value)
      next()
    })

    .then(/"([^"]+)" should equal ([+0-9,.-]+)/, function (node, number, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data).to.equal(+number)
      next()
    })

    .then(/"([^"]+)" should be ([^ ]+) ([+0-9,.-]+)/, function (node, assertion, number, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data).to.be[assertion](+number)
      next()
    })

    .then(/"([^"]+)" should equal (true|false)/, function (node, bool, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data, `${node} should be ${bool}`).to.equal(bool === 'true')
      next()
    })

    .given('"$node" should equal\n$text', function (node, text, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data).to.equal(text)
      next()
    })

    .then('"$node" should exist', function (node, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data).to.not.equal(undefined)
      next()
    })

    .then('"$node" should not exist', function (node, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data).to.equal(undefined)
      next()
    })

    .then('"$node" should match $regexp', function (node, regexp, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body)
      expect(data).to.match(new RegExp(regexp))
      next()
    })

    .then(/a list of "([^"]+)" with ([0-9]+) of ([0-9]+) items? should be returned/, function (itemContext, num, total, next) {
      const context = this.ctx
      expect(context.response.statusCode).to.equal(200)
      checkList(context.response.body, itemContext, num, total)
      next()
    })

    .then(/a list of "([^"]+)" should be returned/, function (itemContext, next) {
      const context = this.ctx
      expect(context.response.statusCode).to.equal(200)
      checkList(context.response.body, itemContext)
      next()
    })

    .then(/"([^"]+)" should be a list of "([^"]+)" with ([0-9]+) of ([0-9]+) items?/, function (node, itemContext, num, total, next) {
      const context = this.ctx
      expect(context.response.statusCode).to.equal(200)
      checkList(context.response.body[node], itemContext, num, total)
      next()
    })

    .then('I filter the list by $property equals (true|false)', function (property, bool, next) {
      const context = this.ctx
      context.response.body.items = _filter(context.response.body.items, (item) => {
        return _property(property)(item) === (bool === 'true')
      })
      context.response.body.__filtered = true
      next()
    })

    .then(/I filter the list by ([^ ]+) contains "([^"]+)/, function (property, text, next) {
      const context = this.ctx
      text = utils.template(text, utils.data(context))
      context.response.body.items = _filter(context.response.body.items, (item) => {
        let data = _property(property)(item)
        return data.search(text) >= 0
      })
      context.response.body.__filtered = true
      next()
    })

    .then(/"([^"]+)" of the ([0-9]+)[a-z]+ item should equal "([^"]+)"/, function (node, num, value, next) {
      const context = this.ctx
      value = utils.template(value, utils.data(context))
      const data = _property(node)(context.response.body.items[num - 1])
      expect(data).to.equal(value)
      next()
    })

    .then(/"([^"]+)" of the ([0-9]+)[a-z]+ item should equal (true|false)/, function (node, num, bool, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body.items[num - 1])
      expect(data).to.equal(bool === 'true')
      next()
    })

    .then(/"([^"]+)" of the ([0-9]+)[a-z]+ item should equal ([+0-9,.-]+)/, function (node, num, number, next) {
      const context = this.ctx
      const data = _property(node)(context.response.body.items[num - 1])
      expect(data).to.equal(+number)
      next()
    })

    .then('JWT $property should exist', function (property, next) {
      const context = this.ctx
      checkJwtProperty(context, property, function (value) {
        expect(value).to.not.equal(undefined)
      }, next)
    })

    .then('JWT $property should equal "$value"', function (property, value, next) {
      const context = this.ctx
      value = utils.template(value, utils.data(context))
      checkJwtProperty(context, property, value, next)
    })

    .then(/JWT ([^ ]+) should equal (true|false)/, function (property, bool, next) {
      const context = this.ctx
      checkJwtProperty(context, property, bool === 'true', next)
    })

    .then(/JWT ([^ ]+) should be ([0-9]+) ([a-z]+) in the (future|past)/, function (property, num, type, dir, next) {
      const context = this.ctx
      let d = new Date()
      let m = 1
      if (type.charAt(0) === 'm') {
        m = 60
      }
      if (type.charAt(0) === 'h') {
        m = 3600
      }
      if (type.charAt(0) === 'd') {
        m = 60 * 60 * 24
      }
      let t = Math.floor(d.getTime() / 1000) + (dir === 'past' ? -1 : 1) * +num * m
      checkJwtProperty(context, property, function (value) {
        expect(value).to.be.within(t - 1, t + 1)
      }, next)
    })

    .then('I parse JWT token into "$name"', function (name, next) {
      const context = this.ctx
      utils.data(context, name, _merge(
        {
          $context: context.response.body.$context,
          _token: context.response.body.token
        },
        JSON.parse(new Buffer(context.response.body.token.split('.')[1], 'base64').toString('binary'))
      ))
      jwtTokenStore = name
      next()
    })

    .given('I parse JWT token from "$storage" into "$name"', function (storage, name, next) {
      const context = this.ctx
      const value = utils.data(context, storage)
      utils.data(context, name, _merge(
        {
          $context: tokenContext,
          _token: value
        },
        JSON.parse(new Buffer(value.split('.')[1], 'base64').toString('binary')))
      )
      jwtTokenStore = name
      next()
    })

    // Debug stuff
    .then('I print the response', function (next) {
      const context = this.ctx
      if (context.response.body.$context && context.response.body.$context === 'https://github.com/RHeactorJS/models#List') {
        console.log('List containing', context.response.body.items.length, 'of', context.response.body.total, 'items of', context.response.body.context)
        console.log('Links:')
        console.log(context.response.body.$links)
        console.log('Items:')
        console.log(context.response.body.items)
      } else {
        console.log(context.response.body)
      }
      next()
    })
}
