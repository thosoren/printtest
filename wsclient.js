$(function () {
  "use strict";

  	

 	// for better performance - to avoid searching in DOM
  var content = $('#content');
  var select = $('#restaurants');
  var button = $('#connect-restaurant');
  var selectContainer = $("#restaurant-select-container");
  var statuspill = $('#status-pill');
  var printerSelect = $('#printer');

  // if user is running mozilla then use it's built-in WebSocket
  window.WebSocket = window.WebSocket || window.MozWebSocket;
  // if browser doesn't support WebSocket, just show
  // some notification and exit
  if (!window.WebSocket) {
    console.log('Sorry, but your browser doesn\'t support WebSocket.');
    return;
  }
  // open connection
  var connection = new WebSocket('ws://print.stg.sushibar.no:1337');
  connection.onopen = function () {
    // first we want users to enter their names
    
  };
  connection.onerror = function (error) {
    // just in there were some problems with connection...
    console.log('Sorry, but there\'s some problem with yourconnection or the server is down.');
  };
  // most important part - incoming messages
  connection.onmessage = function (message) {
    // try to parse JSON message. Because we know that the server
    // always returns JSON this should work without any problem but
    // we should make sure that the massage is not chunked or
    // otherwise damaged.
    try {
      var json = JSON.parse(message.data);
    } catch (e) {
      console.log('Invalid JSON: ', message.data);
      return;
    }
    if (json.type === 'restaurants') {
      $.each(json.restaurants,function(index,restaurant) {
        console.log(restaurant.name);
        select.append(new Option(restaurant.name,restaurant.id));
      });

    } else if(json.type == "connected") {
  		alert("Connected as " + json.restaurant.name);
  		selectContainer.css('display','none');
      statuspill.css('display','block').html('Koblet til - ' + json.restaurant.name);
    } else if (json.type === 'pdf') {
		  printFromUrl(json.url);
      displayAlert(json.title);
    } else if (json.type === 'error') { // entire message history
		alert(json.message);
    } else {
		console.log('Hmm..., I\'ve never seen JSON like this:', json);
    }
  };
  
  /**
   * This method is optional. If the server wasn't able to
   * respond to the in 3 seconds then show some error message 
   * to notify the user that something is wrong.
   */
  setInterval(function() {
    if (connection.readyState !== 1) {
      console.log('Unable to communicate with the WebSocket server.');
    }
  }, 3000);

  button.click(function() {
    if(select.val() == 0) {
      alert("Du må velge restaurant");
      return;
    } else if(printerSelect.val() == 0) {
      alert("Du må velge printer");
      return;
    }
    console.log("Chosen restaurant = " + select.val());
    var obj = {
      type: "chosen_restaurant",
      restaurant: select.val()
    };
    connection.send(JSON.stringify(obj));
  });


  function displayAlert(text) {
    $('#print-alert').html(text).slideDown();
    setInterval(function() {
      $('#print-alert').slideUp();
    }, 3000);
  }

	

  
});