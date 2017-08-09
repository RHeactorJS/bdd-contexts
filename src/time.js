/* global process */

import Yadda from 'yadda'
import lolex from 'lolex'
import moment from 'moment'
import {ValidationFailedError} from '@rheactorjs/errors'
import {expect} from 'chai'

const English = Yadda.localisation.English
const dictionary = new Yadda.Dictionary()

let clock
const setClock = time => {
  if (clock) clock.uninstall()
  clock = lolex.install(time)
}

export const TimeContext = {
  library: English.library(dictionary)
    .given('we are $num days in the $direction', function (num, direction, next) {
      switch (direction) {
        case 'future':
          setClock(moment().add(num, 'days').valueOf())
          break
        case 'past':
          setClock(moment().subtract(num, 'days').valueOf())
          break
        default:
          throw new ValidationFailedError('Invalid direction: ' + direction)
      }
      if (process.env.DEBUG_TIME) {
        console.log('🕘', new Date())
      }
      next()
    })
    .given('it is $weekday', function (weekday, next) {
      setClock(moment().day(weekday).valueOf())
      if (process.env.DEBUG_TIME) {
        console.log('✓', '🕘', new Date())
      }
      next()
    })
    .given('we are back to the present', function (next) {
      if (clock) clock.uninstall()
      if (process.env.DEBUG_TIME) {
        console.log('✕', '🕘', new Date())
      }
      next()
    })
    .then('"$node" should be $num days in the $direction', function (node, num, direction, next) {
      const context = this.ctx
      switch (direction) {
        case 'future':
          expect(Math.round(moment.duration(new Date(context.response.body[node]).getTime() - Date.now()).asDays())).to.equal(+num)
          break
        case 'past':
          expect(Math.round(moment.duration(Date.now() - new Date(context.response.body[node]).getTime()).asDays())).to.equal(-num)
          break
        default:
          throw new ValidationFailedError('Invalid direction: ' + direction)
      }
      next()
    })
    .then('"$node" should be now', function (node, next) {
      const context = this.ctx
      expect(Math.round(moment.duration(new Date(context.response.body[node]).getTime() - Date.now()).asSeconds())).to.be.within(-10, 10)
      next()
    })
    .then('the $header header should be now', function (header, next) {
      const context = this.ctx
      expect(Math.round(moment.duration(new Date(context.response.header[header.toLowerCase()]).getTime() - Date.now()).asSeconds())).to.be.within(-10, 10)
      next()
    })
}
