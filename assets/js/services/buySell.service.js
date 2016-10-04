angular
  .module('walletApp')
  .factory('buySell', buySell);

function buySell ($rootScope, $timeout, $q, $state, $uibModal, $uibModalStack, Wallet, MyWallet, MyWalletHelpers, Alerts, currency, MyWalletBuySell) {
  let states = {
    error: ['expired', 'rejected', 'cancelled'],
    success: ['completed', 'completed_test'],
    pending: ['awaiting_transfer_in', 'reviewing', 'pending'],
    completed: ['expired', 'rejected', 'cancelled', 'completed', 'completed_test', 'processing']
  };
  let tradeStateIn = (states) => (t) => states.indexOf(t.state) > -1;

  let txHashes = {};
  let watching = {};
  let initialized = $q.defer();

  let poll;
  let maxPollTime = 30000;

  let _buySellMyWallet;

  let buySellMyWallet = () => {
    if (!Wallet.status.isLoggedIn) {
      return null;
    }
    if (!_buySellMyWallet) {
      _buySellMyWallet = new MyWalletBuySell(MyWallet.wallet, $rootScope.buySellDebug);
      if (_buySellMyWallet.exchanges) { // Absent if 2nd password set
        _buySellMyWallet.exchanges.coinify.partnerId = 18; // Replaced by Grunt for production
      }
    }
    return _buySellMyWallet;
  };

  const service = {
    getStatus: () => buySellMyWallet() && buySellMyWallet().status,
    getExchange: () => {
      if (!buySellMyWallet() || !buySellMyWallet().exchanges) return null; // Absent if 2nd password set
      return buySellMyWallet().exchanges.coinify;
    },
    trades: { completed: [], pending: [] },
    kycs: [],
    getTxMethod: (hash) => txHashes[hash] || null,
    initialized: () => initialized.promise,
    login: () => initialized.promise.finally(service.fetchProfile),
    init,
    getQuote,
    getKYCs,
    getRate,
    calculateMax,
    triggerKYC,
    getOpenKYC,
    getTrades,
    watchAddress,
    fetchProfile,
    openBuyView,
    pollKYC,
    pollUserLevel,
    getCurrency,
    signupForAccess,
    submitFeedback,
    tradeStateIn,
    states
  };

  let unwatch = $rootScope.$watch(service.getExchange, (exchange) => {
    if (exchange) init(exchange).then(unwatch).then(initialized.resolve);
  });

  return service;

  function init (exchange) {
    if (exchange.trades) setTrades(exchange.trades);
    exchange.monitorPayments();
    return $q.resolve();
  }

  function getQuote (amt, curr, quoteCurr) {
    if (curr === 'BTC') {
      amt = Math.trunc(amt * 100000000);
    } else {
      amt = Math.trunc(amt * 100);
    }
    return $q.resolve(service.getExchange().getBuyQuote(amt, curr, quoteCurr));
  }

  function getKYCs () {
    return $q.resolve(service.getExchange().getKYCs()).then(kycs => {
      service.kycs = kycs.sort((k0, k1) => k1.createdAt > k0.createdAt);
      return service.kycs;
    });
  }

  function getRate (base, quote) {
    let getRate = service.getExchange().exchangeRate.get(base, quote);
    return $q.resolve(getRate);
  }

  function calculateMax (rate, method) {
    let currentLimit = service.getExchange().profile.currentLimits[method].inRemaining;
    let userLimits = service.getExchange().profile.level.limits;
    let dailyLimit = userLimits[method].inDaily;

    let limits = {};
    limits.max = (Math.round(((rate * dailyLimit) / 100)) * 100);
    limits.available = (rate * currentLimit).toFixed(2);

    limits.available > limits.max && (limits.available = limits.max);
    limits.available > 0 ? limits.available : 0;
    limits.max = limits.max.toFixed(2);

    return limits;
  }

  function triggerKYC () {
    return $q.resolve(service.getExchange().triggerKYC()).then(kyc => {
      service.kycs.unshift(kyc);
      return kyc;
    });
  }

  function pollKYC () {
    let kyc = service.kycs[0];

    if (kyc && kyc.state !== 'pending') { return; }
    if (poll && poll.$$state.status === 0) { return; }

    poll = service.pollUserLevel(kyc).result
      .then(() => Alerts.displaySuccess('KYC_APPROVED', true))
      .then(() => {
        $state.go('wallet.common.buy-sell');
        $uibModalStack.dismissAll();
        $timeout(service.openBuyView, 500);
      });
  }

  function pollUserLevel (kyc) {
    let stop;
    let profile = service.getExchange().profile;

    let pollUntil = (action, test) => $q((resolve) => {
      let exit = () => { stop(); resolve(); };
      let check = () => action().then(() => test() && exit());
      stop = MyWalletHelpers.exponentialBackoff(check, maxPollTime);
    });

    let pollKyc = () => pollUntil(() => kyc.refresh(), () => kyc.state === 'completed');
    let pollProfile = () => pollUntil(() => profile.fetch(), () => +profile.level.name === 2);

    return {
      cancel: () => stop && stop(),
      result: $q.resolve(pollKyc().then(pollProfile))
    };
  }

  function getOpenKYC () {
    return service.kycs.length ? $q.resolve(service.kycs[0]) : service.triggerKYC();
  }

  function getTrades () {
    return $q.resolve(service.getExchange().getTrades()).then(setTrades);
  }

  function setTrades (trades) {
    service.trades.pending = trades.filter(tradeStateIn(states.pending));
    service.trades.completed = trades.filter(tradeStateIn(states.completed));

    service.trades.completed
      .filter(t => (
        tradeStateIn(states.success)(t) &&
        !t.bitcoinReceived &&
        !watching[t.receiveAddress]
      ))
      .forEach(service.watchAddress);

    service.trades.completed.forEach(t => {
      let type = t.isBuy ? 'buy' : 'sell';
      if (t.txHash) { txHashes[t.txHash] = type; }
    });

    return service.trades;
  }

  function watchAddress (trade) {
    watching[trade.receiveAddress] = true;
    trade.watchAddress().then(() => {
      if (trade.txHash && trade.isBuy) { txHashes[trade.txHash] = 'buy'; }
      service.openBuyView(trade, { bitcoinReceived: true });
    });
  }

  function fetchProfile (lean) {
    let success = () => $q.all([
      service.getTrades(),
      service.getKYCs(),
      service.getExchange().getBuyCurrencies().then(currency.updateCoinifyCurrencies)
    ]);

    let error = (err) => {
      let msg;
      try { msg = JSON.parse(err).error.toUpperCase(); } catch (e) { msg = 'INVALID_REQUEST'; }
      return $q.reject(msg);
    };

    return $q.resolve(service.getExchange().fetchProfile())
      .then(lean ? () => {} : success, error);
  }

  function openBuyView (trade = null, options = {}) {
    return $uibModal.open({
      templateUrl: 'partials/buy-modal.jade',
      windowClass: 'bc-modal auto buy',
      controller: 'BuyCtrl',
      backdrop: 'static',
      keyboard: false,
      resolve: {
        trade: () => trade && trade.refresh().then(() => trade),
        buyOptions: () => options
      }
    }).result;
  }

  function getCurrency (trade) {
    if (trade && trade.inCurrency) return currency.currencies.filter(t => t.code === trade.inCurrency)[0];
    let coinifyCurrencies = currency.coinifyCurrencies;
    let walletCurrency = Wallet.settings.currency;
    let isCoinifyCompatible = coinifyCurrencies.some(c => c.code === walletCurrency.code);
    let exchange = service.getExchange();
    let coinifyCode = exchange && exchange.profile ? exchange.profile.defaultCurrency : 'EUR';
    return isCoinifyCompatible ? walletCurrency : coinifyCurrencies.filter(c => c.code === coinifyCode)[0];
  }

  function signupForAccess (email, country) {
    let url = 'https://docs.google.com/forms/d/e/1FAIpQLSeYiTe7YsqEIvaQ-P1NScFLCSPlxRh24zv06FFpNcxY_Hs0Ow/viewform?entry.1192956638=' + email + '&entry.644018680=' + country;
    let otherWindow = window.open(url);
    otherWindow.opener = null;
  }

  function submitFeedback (rating) {
    let url = 'https://docs.google.com/a/blockchain.com/forms/d/e/1FAIpQLSeKRzLKn0jsR19vkN6Bw4jK0QW-2pH6Ptb-LbFSaOqxOnbO-Q/viewform?entry.1125242796=' + rating;
    let otherWindow = window.open(url);
    otherWindow.opener = null;
  }
}
