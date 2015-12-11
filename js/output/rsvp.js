(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
function noop() {}

function parseResponse(data, cb) {

    var cells = data.feed.entry,
        sheet = {};

    function parseCell(cell) {

        var content = cell.content.$t,
            column = cell.title.$t.replace(/\d+/, ''),
            row = +cell.title.$t.replace(/[A-Z]/, '');

        // gimme some bools
        if ( content === 'TRUE' ) content = true;
        if ( content === 'FALSE' ) content = false;

        if ( row ) {
            // if no row exists in the sheet data, create one
            if ( !sheet[row] ) sheet[row] = {};

            // add data to sheet
            sheet[row][column] = content;
        }
    }

    cells.forEach(parseCell);
    if (cb) cb(sheet);
    return sheet;
}

// Automatically GETs data and stores it for retrieval
var gsheet = function(url) {

    if ( !(this instanceof gsheet) ) return new gsheet(url);

    this.sheet = [];

    function success(data) {
        this.sheet = parseResponse(data);
    }

    var _this = this;
    this.promise = $.ajax({
        url: url,
        success: success.bind(_this),
        error: function(error) {
            console.log(error);
        }
    });
    return this;
};

gsheet.prototype.ready = function ready(cb) {
    var _this = this;
    return this.promise.then(function() {
        if ( cb ) return cb.call(_this, _this.sheet);
        return _this;
    });
};

gsheet.prototype.byKey = function byKey() {

    var sheet = this.sheet,
        output = {},
        key,
        row,
        col;

    if ( sheet[1] ) {
        // assume keys are in the first row
        for ( col in sheet[1] ) {
            output[sheet[1][col]] = {
                col: col,
                data: []
            };
        }
    }

    for ( row in sheet ) {
        for ( key in output ) {
            // get the column
            col = output[key].col;
            // push value
            output[key].data.push( sheet[row][col] );
        }
    }

    // ignore the first row
    for ( key in output ) {
        output[key].data = output[key].data.slice(1);
    }

    return output;
};

module.exports = gsheet;

},{}],2:[function(require,module,exports){
var util = require('./util.js'),
    ui = require('./rsvp-ui.js');

function Handler($form) {

    var nameInput = $form.find('[name="your-name"]'),
        sheet = false,
        callbacks = {};

    function submit(e) {
        e.preventDefault();
        var response = checkName(sheet);
        trigger(response.type, response);
    }

    function updateWith(newSheet) {
        sheet = newSheet;
    }

    function on(which, cb) {
        if ( !callbacks.hasOwnProperty(which) ) {
            callbacks[which] = cb;
        }
    }

    function trigger(which) {
        var args = Array.prototype.slice.call(arguments);
        args = args.slice(1);
        return callbacks[which].apply(null, args);
    }

    // expects the name to be exactly as it is in the sheet
    function indexFromName(name) {
        var i = 0;
        while ( i < getValues('name').length ) {
            if ( getValue('name', i) === name ) return i;
            i++;
        }
        return false;
    }

    function getValue(col, index) {
        col = col.toUpperCase();
        return sheet[col].data[index];
    }

    function getValues(col) {
        col = col.toUpperCase();
        return sheet[col].data;
    }

    function checkName(sheet) {

        var name,
            altCopy,
            i = 0;

        name = nameInput.val();
        name = util.ignoreNonLetter(name);

        if ( name === '' ) {
            return {
                type: 'empty'
            };
        }

        function success(i) {
            var response = {
                type: 'success',
                name: getValue('name', i),
                party: {},
                rsvp: getValue('rsvp', i),
                submitter: getValue('submitter', i),
                nameCol: sheet['NAME'].col,
                rsvpCol: sheet['RSVP'].col,
                submitterCol: sheet['SUBMITTER'].col
            };

            response.rsvp = util.affirmToBool(response.rsvp);

            // get RSVPs for all members in this party
            (getValue('party', i) || '').split(', ').forEach(function(member) {
                if ( member ) {
                    var memberIndex = indexFromName(member);
                    response.party[member] = getValue('rsvp', memberIndex);
                    response.party[member] = util.affirmToBool(response.party[member]);
                }
            });

            return response;
        }

        if ( sheet ) {

            // check for name
            while ( i < getValues('name').length ) {
                if ( name === util.ignoreNonLetter(getValue('name', i)) ) {
                    // yay, we found it
                    return success(i);
                }
                i++;
            }

            // if not found, check in alt names
            i = 0;
            while ( i < getValues('alt_name').length ) {

                // coerce the alt names to just lowercase letters
                altCopy = getValue('alt_name', i) || '';
                altCopy = altCopy.split(', ').map(function(name) {
                    return util.ignoreNonLetter(name);
                });

                if ( altCopy.indexOf(name) > -1 ) {
                    // yay, we found it
                    return success(i);
                }
                i++;
            }

            // if still not found, this person is an imposter!
            return {
                type: 'error',
                input: nameInput
            };

        } else {
            console.log('sheet not ready yet...');
            setTimeout(checkName, 250);
        }
    }

    $form.on('submit', submit);

    return {
        submit: submit,
        checkName: checkName,
        updateWith: updateWith,
        on: on,
        trigger: trigger
    };
}

module.exports = Handler;

},{"./rsvp-ui.js":3,"./util.js":5}],3:[function(require,module,exports){
var util = require('./util.js');

function UI(container) {

    // This will be updated upon response and by the user
    var data;

    var scriptEndpoint = 'https://script.google.com/macros/s/AKfycbztgTxGYXDaq-wzDna_qUgAuGYY8I--7gDpISJXP7ZOOL8dmKQ/exec';

    // error message that's shown in various scenarios
    var formError = $('#form-error');

    // A successful response from the form handler --
    // excepts a name, RSVP (true, false, or undefined),
    // and a party (named or +1)
    function showForm(response) {

        var name = response.name,
            party = response.party,
            rsvp = response.rsvp,
            submitter = response.submitter,
            form = container.find('form');

        // set data, passed through from Gsheet response
        data = response;

        function containerHasFaded() {

            form.remove();
            formError.remove();

            setTimeout(function formHasBeenRemoved() {
                var greetings = $('<h2>Hi ' + name.split(' ')[0] + '!</h2>');

                container.append(greetings);

                container.fadeIn();

                // from here what happens depends on the status of the RSVP
                if ( rsvp === true || rsvp === false ) {
                    return ( response.name === response.submitter ) ?
                        hasRsvped(response) :
                        hasBeenRsvped(response);
                }

                return hasYetToRsvp(response);
            }, 10);
        }

        container.fadeOut(containerHasFaded);
    };

        // The visitor has not RSVPed, and has not been RSVPed by anyone
        // in their party. Prompt them to RSVP for themselves and, if
        // applicable, for anyone else in their party.
        function hasYetToRsvp(response) {

            var question = $('<p>Well, here we are, popping the big question: will you be attending?</p>');
            container.append(question);

            var attending = $('<input type="radio" name="attending" id="attending-yes" value="1">'),
                notAttending = $('<input type="radio" name="attending" id="attending-no" value="0">');
            container.append(attending).append(notAttending);
            attending.after('<label for="attending-yes">Yes!</label><br>');
            notAttending.after('<label for="attending-no">No 😢</label>');

            // note that this gets called from a jQuery object,
            // so reference this.val() for the radio button's value inside
            function updateRsvp(response) {
                data.rsvp = Boolean(parseInt(this.val()));
                data.submitter = response.name;
            }

            // same as above, but party member's name include
            // via jQuery's .data() method
            function updatePartyMemberRsvp() {
                var member = this.data('member');
                data.party[member] = Boolean(parseInt(this.val()));
            }

            attending.change(updateRsvp.bind(attending, response));
            notAttending.change(updateRsvp.bind(notAttending, response));

            var member, rsvp,
                memberContainer = $('<div class="members">'),
                party = [],
                withoutRsvp = 0;

            memberContainer.prepend('<p>Your party:</p>');

            // if no plus one and no party members, response.party = {}
            // otherwise, keys are names (or '1' for plus one)
            if ( Object.keys(response.party).length > 0 ) {
                for ( member in response.party ) {

                    rsvp = response.party[member];

                    // plus ones
                    if ( member === '1' ) {

                        // clear the existing "Your party:" text
                        memberContainer.html('<p>Would you like to RSVP for a plus one?</p>');

                    // named party members
                    } else {

                        var memberNodeContainer = $('<div>').hide();

                        var node = $('<p>' + member + '</p>');

                        if ( rsvp === true ) {
                            node.append(' (Attending)');
                        } else if ( rsvp === false ) {
                            node.append(' (Not attending 😢)');
                        }

                        memberContainer.append(node);

                        // if no RSVP yet, ask this member if they want to RSVP
                        if ( rsvp !== true && rsvp !== false ) {

                            withoutRsvp++;

                            var memberAttending = $('<input type="radio" name="attending-' + util.ignoreNonLetter(member) + '" id="attending-' + util.ignoreNonLetter(member) + '-yes" value="1">'),
                                memberNotAttending = $('<input type="radio" name="attending-' + util.ignoreNonLetter(member) + '" id="attending-' + util.ignoreNonLetter(member) + '-no" value="0">');

                            memberAttending
                                .data('member', member)
                                .change(updatePartyMemberRsvp.bind(memberAttending));
                            memberNotAttending
                                .data('member', member)
                                .change(updatePartyMemberRsvp.bind(memberNotAttending));

                            memberContainer
                                .append(memberAttending)
                                .append('<label for="attending-' + util.ignoreNonLetter(member) + '-yes">Yes!</label><br>')
                                .append(memberNotAttending)
                                .append('<label for="attending-' + util.ignoreNonLetter(member) + '-no">No 😢</label>');
                        }
                    }
                }

                if ( withoutRsvp > 0 ) {
                    // console.log('')
                }

                container.append(memberContainer);
            }

            var submit = $('<input type="submit" id="submit">');
            submit.click(function(e) {
                e.preventDefault();
                submitRsvp();
            });
            container.append('<br><br>');
            container.append(submit);
        }

        function hasRsvped(response) {
            rsvpText(response);
        }

        function hasBeenRsvped(response) {
            var submitter = response.submitter.split(' ')[0];
            rsvpText(response, submitter);
        }

        function rsvpText(response, submitter) {
            // slightly different texts depending on if the submitter
            // is the visitor or if someone else submitted the RSVP
            container.append('<p>Your RSVP ' + (response.rsvp === true ? 'to attend' : 'to sit this one out') + ' has been ' + ( submitter ? 'submitted by ' + submitter + '.' : ' received.' ) + '</p>');
            container.append('<p>If you need to change your RSVP, please email us ' + (submitter ? '(or ask ' + submitter + ' to email us)' : '' ) + ' as soon as possible to make sure it gets updated: <a href="mailto:scott.p.donaldson@gmail.com">scott.p.donaldson@gmail.com</a></p>');
        }

    // An error from the form handler.
    // Prompt the user to enter their name again.
    function showError(response) {
        var input = response.input;
        input.addClass('error');

        if ( formError.length === 0 || formError.data('tries') === 0 ) {

            // in case there was one already shown
            formError.fadeOut();

            formError = $('<div id="form-error">We couldn\'t find your name on the list. Did you spell it exactly as it was on your&nbsp;invitation?</div>').hide();
            formError.data('tries', 1);
            container.append(formError.fadeIn());

            input.on('change keyup paste blur', function() {
                $(this).removeClass('error');
            });

        } else if ( formError.data('tries') === 1 ) {

            formError.data('tries', 2);
            formError.fadeOut(function() {
                formError.html('Hmmm, still no luck. Will you humor us and try one more time? Spelling really counts&nbsp;here...').fadeIn();
            });

        } else if ( formError.data('tries') === 2 ) {

            formError.fadeOut(function() {
                formError.html('Sorry, something must be going wrong. This is really embarrassing, but could you email your RSVP to us at <a href="mailto:scott.p.donaldson@gmail.com">scott.p.donaldson@gmail.com</a>?').fadeIn();
            });
        }
    }

    // Error to show when an empty name was passed
    function showEmpty() {
        formError = $('<div id="form-error">Er, we need to know your name to help process your RSVP. Do you know how many people will be trying to crash this wedding?</div>').hide();
        formError.data('tries', 0);
        container.append(formError.fadeIn());
    }

    function submitRsvp() {
        // stringify the party to be sent to the server
        data.party = JSON.stringify(data.party);
        $.ajax({
            url: scriptEndpoint,
            type: 'POST',
            data: data,
            success: function(response) {
                console.log(response);
            }
        });
    }

    return {
        showForm: showForm,
        showError: showError,
        showEmpty: showEmpty
    };
}

module.exports = UI;

},{"./util.js":5}],4:[function(require,module,exports){
function buildURL() {
    var key1 = '1g6-vCbyXGaaqebez1cUwx',
        key2 = 'gNyLvlEIen_MBjyTVrcUcU';
    return 'https://spreadsheets.google.com/feeds/cells/' + key1 + key2 + '/1/public/basic?alt=json';
}

var container = $('#content-container'),
    form = $('#check-name'),
    sheet = false;

var util = require('./util.js'),
    gsheet = require('./gsheet.js'),
    handler = require('./rsvp-handler.js')(form),
    ui = require('./rsvp-ui.js')(container);

// once the data from the sheet is ready, update the handler
gsheet(buildURL()).ready(function() {

    // hide loading animation
    hub.trigger('loaded');

    // show form
    form.fadeIn();

    // update form handler with data
    handler.updateWith(this.byKey());
});

handler.on('empty', ui.showEmpty);
handler.on('success', ui.showForm);
handler.on('error', ui.showError);

},{"./gsheet.js":1,"./rsvp-handler.js":2,"./rsvp-ui.js":3,"./util.js":5}],5:[function(require,module,exports){
module.exports = {
    ignoreNonLetter: function ignoreNonLetter(str) {
        return str ? str.replace(/[^a-zA-Z]/g, '').toLowerCase() : '';
    },
    affirmToBool: function(affirm) {
        if ( affirm === 'Yes' || affirm === 'yes' ) {
            return true;
        } else if ( affirm === 'No' || affirm === 'no' ) {
            return false;
        }
        return affirm;
    },
    boolToAffirm: function(bool) {
        if ( bool === true ) {
            return 'Yes';
        } else if ( bool === false ) {
            return 'No';
        }
        return bool;
    }
};

},{}]},{},[4]);
