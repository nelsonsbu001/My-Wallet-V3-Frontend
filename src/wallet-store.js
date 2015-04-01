(function() {
  var hasProp = {}.hasOwnProperty;

  this.WalletStore = (function() {
    var address_book, addresses, currencyCodeToCurrency, didUpgradeToHd, languageCodeToLanguage, mnemonicVerified, transactions, xpubs;
    languageCodeToLanguage = {
      'de': 'German',
      'hi': 'Hindi',
      'no': 'Norwegian',
      'ru': 'Russian',
      'pt': 'Portuguese',
      'bg': 'Bulgarian',
      'fr': 'French',
      'zh-cn': 'Chinese Simplified',
      'hu': 'Hungarian',
      'sl': 'Slovenian',
      'id': 'Indonesian',
      'sv': 'Swedish',
      'ko': 'Korean',
      'el': 'Greek',
      'en': 'English',
      'it': 'Italiano',
      'es': 'Spanish',
      'vi': 'Vietnam',
      'th': 'Thai',
      'ja': 'Japanese',
      'pl': 'Polski',
      'da': 'Danish',
      'ro': 'Romanian',
      'nl': 'Dutch',
      'tr': 'Turkish'
    };
    currencyCodeToCurrency = {
      'ISK': 'lcelandic Króna',
      'HKD': 'Hong Kong Dollar',
      'TWD': 'New Taiwan Dollar',
      'CHF': 'Swiss Franc',
      'EUR': 'Euro',
      'DKK': 'Danish Krone',
      'CLP': 'Chilean, Peso',
      'USD': 'U.S. Dollar',
      'CAD': 'Canadian Dollar',
      'CNY': 'Chinese Yuan',
      'THB': 'Thai Baht',
      'AUD': 'Australian Dollar',
      'SGD': 'Singapore Dollar',
      'KRW': 'South Korean Won',
      'JPY': 'Japanese Yen',
      'PLN': 'Polish Zloty',
      'GBP': 'Great British Pound',
      'SEK': 'Swedish Krona',
      'NZD': 'New Zealand Dollar',
      'BRL': 'Brazil Real',
      'RUB': 'Russian Ruble'
    };
    mnemonicVerified = false;
    xpubs = [];
    transactions = [];
    addresses = {};
    didUpgradeToHd = null;
    address_book = {};
    return {
      getLanguages: function() {
        return languageCodeToLanguage;
      },
      getCurrencies: function() {
        return currencyCodeToCurrency;
      },
      didVerifyMnemonic: function() {
        mnemonicVerified = true;
        MyWallet.backupWalletDelayed();
      },
      setMnemonicVerified: function(bool) {
        mnemonicVerified = bool;
      },
      isMnemonicVerified: function() {
        return mnemonicVerified;
      },
      setEmptyXpubs: function() {
        xpubs = [];
      },
      pushXpub: function(xpub) {
        xpubs.push(xpub);
      },
      getXpubs: function() {
        return xpubs;
      },
      getTransactions: function() {
        return transactions;
      },
      getAllTransactions: function() {
        var i, len, ref, results, tx;
        ref = WalletStore.getTransactions();
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          tx = ref[i];
          results.push(MyWallet.processTransaction(tx));
        }
        return results;
      },
      didUpgradeToHd: function() {
        return didUpgradeToHd;
      },
      setDidUpgradeToHd: function(bool) {
        didUpgradeToHd = bool;
      },
      getAddressBook: function() {
        return address_book;
      },
      getAddressBookLabel: function(address) {
        return address_book[address];
      },
      deleteAddressBook: function(addr) {
        delete address_book[addr];
        MyWallet.backupWalletDelayed();
      },
      addAddressBookEntry: function(addr, label) {
        var isValidLabel;
        isValidLabel = MyWallet.isAlphaNumericSpace(label) && MyWallet.isValidAddress(addr);
        if (isValidLabel) {
          address_book[addr] = label;
        }
        return isValidLabel;
      },
      newAddressBookFromJSON: function(addressBook) {
        var entry, i, len;
        address_book = {};
        if (addressBook != null) {
          for (i = 0, len = addressBook.length; i < len; i++) {
            entry = addressBook[i];
            this.addAddressBookEntry(entry.addr, entry.label);
          }
        }
      },
      getAddresses: function() {
        return addresses;
      },
      getAddress: function(address) {
        if (address in addresses) {
          return addresses[address];
        } else {
          return null;
        }
      },
      legacyAddressExists: function(address) {
        return address in addresses;
      },
      getLegacyAddressTag: function(address) {
        if (address in addresses) {
          return addresses[address].tag;
        } else {
          return null;
        }
      },
      setLegacyAddressTag: function(address, tag) {
        addresses[address].tag = tag;
      },
      getLegacyAddressLabel: function(address) {
        if (address in addresses) {
          return addresses[address].label;
        } else {
          return null;
        }
      },
      setLegacyAddressBalance: function(address, balance) {
        addresses[address].balance = balance;
      },
      isActiveLegacyAddress: function(address) {
        return (address in addresses) && (addresses[address].tag !== 2);
      },
      isWatchOnlyLegacyAddress: function(address) {
        return (address in addresses) && (addresses[address].priv == null);
      },
      getLegacyAddressBalance: function(address) {
        if (address in addresses) {
          return addresses[address].balance;
        } else {
          return null;
        }
      },
      getTotalBalanceForActiveLegacyAddresses: function() {
        var a;
        return ((function() {
          var results;
          results = [];
          for (a in addresses) {
            if (!hasProp.call(addresses, a)) continue;
            if (a.tag !== 2) {
              results.push(a.balance);
            }
          }
          return results;
        })()).reduce((function(x, y) {
          return x + y;
        }), 0);
      },
      deleteLegacyAddress: function(address) {
        delete addresses[address];
        MyWallet.backupWalletDelayed();
      },
      getPrivateKey: function(address) {
        if (address in addresses) {
          return addresses[address].priv;
        } else {
          return null;
        }
      },
      setLegacyAddressLabel: function(address, label, success, error) {
        if (label.length > 0 && !MyWallet.isAlphaNumericSpace(label)) {
          return error && error();
        } else {
          addresses[address].label = label;
          MyWallet.backupWalletDelayed();
          return success && success();
        }
      },
      unArchiveLegacyAddr: function(address) {
        var addr;
        addr = addresses[address];
        if (addr.tag === 2) {
          addr.tag = null;
          return MyWallet.backupWalletDelayed('update', function() {
            return MyWallet.get_history();
          });
        } else {
          return MyWallet.sendEvent("msg", {
            type: "error",
            message: 'Cannot Unarchive This Address'
          });
        }
      },
      archiveLegacyAddr: function(address) {
        var addr;
        addr = addresses[address];
        if (addr.tag === null || addr.tag === 0) {
          addr.tag = 2;
          return MyWallet.backupWalletDelayed('update', function() {
            return MyWallet.get_history();
          });
        } else {
          return MyWallet.sendEvent("msg", {
            type: "error",
            message: 'Cannot Archive This Address'
          });
        }
      },
      getAllLegacyAddresses: function() {
        var array, key;
        array = [];
        for (key in addresses) {
          array.push(key);
        }
        return array;
      },

      /**
       * Find the preferred address to use for change
       * Order deposit / request coins
       * return {string} preferred address
       */
      getPreferredLegacyAddress: function() {
        var addr, key, preferred;
        preferred = null;
        for (key in addresses) {
          addr = addresses[key];
          if (preferred === null) {
            preferred = addr;
          }
          if (addr.priv !== null) {
            if (preferred === null) {
              preferred = addr;
            }
            if (addr.tag === null || addr.tag === 0) {
              preferred = addr;
              break;
            }
          }
        }
        return preferred.addr;
      },
      hasLegacyAddresses: function() {
        return Object.keys(addresses).length !== 0;
      },

      /**
       * return {Array} legacy active addresses
       */
      getLegacyActiveAddresses: function() {
        var addr, array, key;
        array = [];
        for (key in addresses) {
          addr = addresses[key];
          if (addr.tag !== 2) {
            array.push(addr.addr);
          }
        }
        return array;
      },

      /**
       * return {Array} archived addresses
       */
      getLegacyArchivedAddresses: function() {
        var addr, array, key;
        array = [];
        for (key in addresses) {
          addr = addresses[key];
          if (addr.tag === 2) {
            array.push(addr.addr);
          }
        }
        return array;
      }
    };
  })();

}).call(this);