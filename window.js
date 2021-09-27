$(() => {

	const electron = require('electron');
	const ipcRenderer = electron;
	const printer = require('pdf-to-printer');
	const fs = require("fs");
	const path = require("path");
	const fetch = require("node-fetch");
	const Store = require('./store.js');
	var pjson = require('./package.json');

	// for better performance - to avoid searching in DOM

	var statuspillRestaurant = $('#status-restaurant');
	var statuspillPrinter = $('#status-printer');
	var restaurantSelect = $('#restaurants');
	var printerSelect = $('#printer');

	let selectedPrinter = null;
	var selectedRestaurant = null;
	var connection;
	var confirmPrintedUrl;
	var webshopUrl;

	var intervalTimer;

	const store = new Store({
	    configName: 'user-preferences'
	});

	var dateOptions = { weekday: 'long', hour : '2-digit', minute: '2-digit' };

	var storedPrinter = store.get('printer');

	if(storedPrinter) {
		setPrinter(storedPrinter);
	} else {
		setPrinterStatus(false);
	}

	// if user is running mozilla then use it's built-in WebSocket
	window.WebSocket = window.WebSocket || window.MozWebSocket;
	// if browser doesn't support WebSocket, just show
	// some notification and exit
	if (!window.WebSocket) {
		console.log('Sorry, but your browser doesn\'t support WebSocket.');
		return;
	}

	printer.list().then(function(printers) {
		$.each(printers,function(index,printer) {
			$("#printer").append(new Option(printer, printer));
		});
		setTimeout(function() {
			$('.loading-container .spinner-border').css('display','none');
			$('.loading-container').fadeOut();
		},1000);
	}).catch(console.error);

	$('#printer').on('change',function() {
		if($(this).val() != 0) {
			selectedPrinter = $(this).val();
			store.set('printer',selectedPrinter);
		}
	});

	$('.version').html("v" + pjson.version);

	$('.form').on('submit', function() {
		var form = this;
		var formData = new FormData(this);
		var action = $(this).attr('action');

		switch(action) {
			case 'choose_restaurant':
				connectRestaurant(formData.get('restaurantid'),formData.get('password'));
			break;

			case 'choose_printer':
				setPrinter(formData.get('printer'));
			break;

			case 'confirm_new_order':
				confirmPrinted(formData.get('oid'));
			break;

		}


		$('.modal').modal('hide');
		return false;
	});

	connect();      

	function printFromUrl(url) {
		console.log('printing: ' + url);
		fetch(url)
		.then((res) => res.buffer())
		.then((buffer) => {
			const pdf = save(buffer);

			printer
			.print(pdf, {
				printer: selectedPrinter
			})
			.then(console.log)
			.catch(console.error)
			.finally(() => remove(pdf));
		});

	}

	function save(buffer) {
		const pdfPath = path.join(__dirname, "./" + randomString() + ".pdf");
		fs.writeFileSync(pdfPath, buffer, "binary");
		return pdfPath;
	}

	function randomString() {
		return Math.random().toString(36).substring(7);
	}

	function remove(pdf) {
		fs.unlinkSync(pdf);
	}

	function print(file) {
		$('.modal').modal();
		printer
		.print(file,{
			printer: selectedPrinter
		})
		.then(console.log)
		.catch(console.error);
	}

	function connect() {

		warningAlert("Kobler til server...");


		// open connection
		connection = new WebSocket('ws://sushibar.no:1337');
		connection.onopen = function () {

			setServerOnline(true);

			if(intervalTimer) {
				clearInterval(intervalTimer);
			}

			var storedRestaurant = store.get('restaurant');

			if(storedRestaurant) {
				selectedRestaurant = storedRestaurant.id;
			} else {
				setRestaurantStatus(false);
				$('#restaurantSelectModal').modal('show');
			}

			if(selectedRestaurant !== null) {
				connectRestaurant(selectedRestaurant,store.get('password'));
			}
		};

		connection.onclose = connectionClosed

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

			switch (json.type) {
				case 'restaurants':
					if(pjson.version != json.server_version) {
						alert("Denne versjonen av ordre-applikasjonen stemmer ikke med serveren, vennligst etterpør ny versjon.\nServer versjon: " + json.server_version + ", app versjon: " + pjson.version);
						window.close();
					}
					restaurantSelect.empty().append(new Option("Velg",0));
					$.each(json.restaurants,function(index,restaurant) {
						restaurantSelect.append(new Option(restaurant.name,restaurant.id));
					});
				break;

				case 'connected':
					setRestaurantStatus(true,json.restaurant.name);
					//getLatestOrders(json.latest_orders_url);
					webshopUrl = json.webshop_url;
					setLatestOrders(json.latest_orders);
					setupReportButtons(json.restaurant);
					confirmPrintedUrl = json.confirm_printed_url;
					
					store.set('restaurant',json.restaurant);
					successAlert(json.restaurant.name + ' koblet til');
				break;

				case 'existing_order':
					printFromUrl(json.url);
					warningAlert(json.title);
					//alertNewOrder(json.oid,json.title);
				break;

				case 'new_order':
					printFromUrl(json.url);
					alertNewOrder(json.oid,json.title);
				break;

				case 'report':
					printFromUrl(json.url);
					//alertPrint(json.title);
					warningAlert(json.title);
				break;

				case 'not_authorized':
					dangerAlert(json.message);
				break;

				case 'order_confirmed_printed':
					addOrderToLastOrders(json.order);
					$('.modal').modal('hide');
				break;

				case 'error':
					dangerAlert(json.message);
				break;

				default:
					console.log('Hmm..., I\'ve never seen JSON like this:', json);
				break;

			}

			
		};
	}




	function setPrinter(printer) {
		selectedPrinter = printer;
		setPrinterStatus(true,printer);
	}


	function connectRestaurant(resId,password) {
		//store the password for automatic connect on startup
		store.set('password',password);
		var obj = {
			type: "chosen_restaurant",
			restaurant_id: resId,
			password: password
		};
		connection.send(JSON.stringify(obj));
	}

	function setupReportButtons(restaurant) {
		$('.dropdown-reports').children().remove();

		var li = $('<li>');
		var btn = $('<a class="dropdown-item">Dagsrapport take-away</a>').appendTo(li);
		btn.click(function() {
			printReport(restaurant.id)
		});
		li.appendTo('.dropdown-reports');

		if(restaurant.delivery_id) {
			var li2 = $('<li>');
			var btn2 = $('<a class="dropdown-item">Dagsrapport utkjøring</a>').appendTo(li2);
			btn2.click(function() {
				printReport(restaurant.delivery_id)
			});
			li2.appendTo('.dropdown-reports');
		}
	}

	function printReport(restaurantId) {
		$.post(webshopUrl,{rapportrestaurant : restaurantId});
	}

	function setRestaurantStatus(connected,restaurantName) {
		if(connected) {
			$('.waiting-for-orders').css('display','block');
			$('#latest-orders-container').css('display','block');
			statuspillRestaurant.css('display','inline-block').removeClass('bg-danger').addClass('bg-success').html(restaurantName);
		} else {
			$('.waiting-for-orders').css('display','none');
			$('#latest-orders-container').css('display','none');
			statuspillRestaurant.css('display','inline-block').removeClass('bg-success').addClass('bg-danger').html('Ikke koblet til');
		}
	}

	function setPrinterStatus(selected,printerName) {
		if(selected) {
			statuspillPrinter.css('display','inline-block').removeClass('bg-danger').addClass('bg-success').html(printerName);
		} else {
			statuspillPrinter.css('display','inline-block').removeClass('bg-success').addClass('bg-danger').html('Ikke valgt');
		}
	}

	function setServerOnline(online) {
		if(online) {
			$('#status-server').removeClass('bg-danger').addClass('bg-success').html('Online');
		} else {
			$('#status-server').removeClass('bg-success').addClass('bg-danger').html('Offline');
		}
		
	}


	function alertPrint(title) {
		var alert = $('<div title="Klikk for å bekrefte printet" class="alert alert-success print-alert" role="alert">' + title + '</div>')
			.appendTo('#print-alerts')
			.slideDown();

		setInterval(function() {
			$(alert).slideUp();
		}, 5000);
	}

	function alertNewOrder(oid,title) {
		
		$('#printAlertModal .modal-body').html(title);
		$('#printAlertModal [name=oid]').val(oid);

		$('#printAlertModal').modal('show');

	}

	function confirmPrinted(oid) {

		var obj = {
			type: "confirm_printed",
			oid: oid
		};
		connection.send(JSON.stringify(obj));
		
	}

	function setLatestOrders(orders) {
		$('#latest-orders-table tbody').empty();
		$.each(orders,function(index,order) {
			order.file_url = webshopUrl + 'webshop/ordrefiler/' + order.id + '.pdf'
		  	addOrderToLastOrders(order);
		});
	}

	function addOrderToLastOrders(order) {
		$('#latest-orders-table tbody').prepend(buildOrderRow(order).fadeIn('slow'));
		var length = $('#latest-orders-table tbody').children().length;
		if(length > 10) {
			var last = $('#latest-orders-table tbody').children()[10];
			$(last).fadeOut();
		}
	}


	function buildOrderRow(order) {
		var row = $('<tr style="display:none;">');
		var button = $('<button class="btn btn-secondary btn-sm">Print</button>');
		button.click(function() {
			printFromUrl(order.file_url);
			warningAlert("Printer ordrenummer: " + order.id);
		});
		row.append('<td>' + order.id + '</td>');
		row.append('<td>' + order.name + '</td>');
		row.append('<td>' + (order.delivery ? 'Utkjøring' : 'Take-away') + '</td>');
		row.append('<td>' + (new Date(order.time)).toLocaleString("nb-NO", dateOptions) + '</td>');
		row.append('<td>' + order.amount + '</td>');
		row.append($('<td>').append(button));

		return row;
	}


	function successAlert(message) {
		showAlert(message,'success');
	}

	function warningAlert(message) {
		showAlert(message,'warning');
	}

	function dangerAlert(message) {
		showAlert(message,'danger');
	}

	function showAlert(message,type) {
		var alert = $(`
			<div style="display: none;" class="alert alert-dismissible alert-`+ type + `">
			  <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
			  `+ message + `  
			</div>`);

		$('#alerts').prepend(alert);
		$(alert).fadeIn();

		//Remove alert after X seconds
		setInterval(function() {
			$(alert).fadeOut('slow', function() {
				$(this).remove();
			});
		}, 5000);
	}


	function connectionClosed(event) {
		setServerOnline(false);
		setRestaurantStatus(false);
		if(!event.wasClean) {
			//if the connection was closed due to server downtime, it should try to re-connect every 3 seconds
			if(typeof intervalTimer == 'undefined') {
				intervalTimer = setInterval(connect,3000);
			}
		} else {
			alert("Koblingen til serveren ble lukket, applikasjonen må startes på nytt for å koble til igjen.")
			window.close();
		}
	}


});