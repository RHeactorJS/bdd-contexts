import Yadda from 'yadda'
import {changeEmailToken, accountActivationToken, lostPasswordToken, GrantSuperUserPermissionsCommand} from '@rheactorjs/server'
import {EmailValue, URIValue} from '@rheactorjs/value-objects'
import {utils} from './util/storage'

const English = Yadda.localisation.English
const dictionary = new Yadda.Dictionary()

const tokens = {
  lostPasswordToken,
  changeEmailToken,
  accountActivationToken
}
const getToken = (self, token, email, payload, storage, next) => {
  const context = self.ctx
  context.$app.repositories.user.getByEmail(new EmailValue(utils.template(email, utils.data(context))))
    .then((user) => {
      let lifetime = context.$app.config.get('activation_token_lifetime')
      if (/^expired/.test(token)) {
        token = token.replace(/^expired/, '')
        lifetime = -1
      }
      return tokens[token](
        new URIValue(context.$app.config.get('api_host')),
        context.$app.config.get('private_key'),
        lifetime,
        user,
        payload
      )
    })
    .then((token) => {
      context.data[storage] = token.token
      next()
    })
}

export const InternalContext = {
  library: English.library(dictionary)
    .given('I have the $token for "$email" in "$storage"', function (token, email, storage, next) {
      return getToken(this, token, email, {}, storage, next)
    })
    .given('I have the token that lets "$email" change their email to "$newemail" in "$storage"', function (email, newemail, storage, next) {
      const self = this
      const context = self.ctx
      return getToken(this, 'changeEmailToken', email, {email: utils.template(newemail, utils.data(context))}, storage, next)
    })
    .given('the account for "$email" is granted superuser permissions', function (email) {
      const context = this.ctx
      const e = new EmailValue(utils.template(email, utils.data(context)))
      return context.$app.repositories.user.getByEmail(e)
        .then(user => context.$app.emitter.emit(new GrantSuperUserPermissionsCommand(user, user)))
    })
}
