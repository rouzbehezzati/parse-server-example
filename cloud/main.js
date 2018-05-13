

/*
Parse.Cloud.define('sendPushNotification', function(request, response) {
        var userId = request.params.userId;
        var message = request.params.message;
        var queryUser = new Parse.Query(Parse.User);
        queryUser.equalTo('objectId', userId);
  
        var query = new Parse.Query(Parse.Installation);
        query.matchesQuery('user', queryUser);

        Parse.Push.send({
          where: query,
          data: {
            alert: message,
            badge: 1,
            sound: 'default'
          }
        }, {
          useMasterKey: true,
          success: function() {
            console.log('##### PUSH OK');
            response.success();
          },
          error: function(error) {
            console.log('##### PUSH ERROR');
            response.error(error.message);
          }
        });
});
*/

Parse.Cloud.define('sendPushNotification', function(request, response) {
  var userId = request.params.userId;
  var message = request.params.message;
  
  sendNotification(userId, message,
  function (errorMessage, result) {
    if (errorMessage)
      response.error(result);
    else 
      response.success();
  });
});

function sendNotification(userId, message, callback) {
  var queryUser = new Parse.Query(Parse.User);
  queryUser.equalTo('objectId', userId);
  var query = new Parse.Query(Parse.Installation);
  query.matchesQuery('user', queryUser);

  Parse.Push.send({
    where: query,
    data: {
      alert: message,
      badge: 1,
      sound: 'default'
    }
  }, {
    useMasterKey: true,
    success: function() {
      console.log('##### PUSH OK');
      callback(null, 'Success');
    },
    error: function(error) {
      console.log('##### PUSH ERROR');
      callback('error', error.message);
    }
  });
}

Parse.Cloud.define('deactivateSchedule', function(request, response) {
  var bookingDayId = request.params.bookingDayId;
  var bookingEventId = request.params.bookingEventId;
  var businessName = request.params.businessName;
  
  var BookingDay = Parse.Object.extend("BookingDay");
  var query = new Parse.Query(BookingDay);
  query.equalTo('objectId', bookingDayId);
  query.include('bookingTickets');
  query.first({
    success: function(object) {
      // Successfully retrieved the object.
      var bookingDay = object;
      var bookingTickets = bookingDay.get("bookingTickets");
      
      for (var i = 0; i < bookingTickets.length; i++) {
        var bookingTicket = bookingTickets[i];
        var bookingTicketStatus = bookingTicket.get("bookingTicketStatus");
        if (bookingTicketStatus == "bookedByBusiness" || bookingTicketStatus == "bookedByClient") {
          bookingTicket.set("bookingTicketStatus", "cancelledByBusiness");
          var CancelledBooking = Parse.Object.extend("CancelledBooking");
          var cancelledBooking = new CancelledBooking();
          
          cancelledBooking.set("cancellationStatus", 'cancelledByBusiness');
          cancelledBooking.set("cancelledBookingTicket", bookingTicket);
          var business = bookingTicket.get("Business");
          cancelledBooking.set("cancelledBookingBusiness", business);
          var now = new Date();
          cancelledBooking.set("cancellationDate", now);
          
          var bookingTicketClientStatus = bookingTicket.get("bookingTicketclientStatus");
          var clientId;
          if (bookingTicketClientStatus == "bookingTicketclientRegistered") {
            var client = bookingTicket.get("client");
            clientId = client.id;
            cancelledBooking.set("cancelledBookingClient", client);
            bookingTicket.set("client", null);
            
          } else if (bookingTicketClientStatus == "bookingTicketclientGuest") {
            var client = bookingTicket.get("guestClient");
            clientId = client.id;
            cancelledBooking.set("cancelledBookingGuestClient", client);
            bookingTicket.set("guestClient", null);
          }
          
          cancelledBooking.save(null, {
            success: function(cancelledBooking) {              
              bookingTicket.set("bookingEventStatus", "bookingEventStatusDeactivated");
              bookingTicket.set("bookingTicketclientStatus", "bookingTicketclientUndefined");
              bookingTicket.save(null, {
                success: function(bookingTicket) {
                  /// update booking day according to cancellation
                  var numberOfReservedBookingsPerDay = bookingDay.get("numberOfReservedBookingsPerDay");
                  bookingDay.set("numberOfReservedBookingsPerDay", numberOfReservedBookingsPerDay - 1);
                  var numberOfAvailableBookingsPerDay = bookingDay.get("numberOfAvailableBookingsPerDay");
                  bookingDay.set("numberOfAvailableBookingsPerDay", numberOfAvailableBookingsPerDay + 1);
                  
                  /// update booking event according to cancellation 
                  var BookingEvent = Parse.Object.extend("BookingEvent");
                  var eventQuery = new Parse.Query(BookingEvent);
                  eventQuery.equalTo('objectId', bookingEventId);
                  eventQuery.first({
                    success: function(bookingEvent) {
                      // Successfully retrieved booking event.
                      var bookingReservedBookings  = bookingEvent.get("bookingReservedBookings") - 1;
                      bookingEvent.set("bookingReservedBookings", bookingReservedBookings);
                      var bookingAvailableBookings = bookingEvent.get("bookingAvailableBookings") + 1;
                      bookingEvent.set("bookingAvailableBookings", bookingAvailableBookings);
                      var bookingCancelledBookings = bookingEvent.get("bookingCancelledBookings") + 1;
                      bookingEvent.set("bookingCancelledBookings", bookingCancelledBookings);
                      bookingEvent.save();
                    },
                    error: function(error) {
                      response.error('Booking Event Error:', error);
                    }
                  });
                  
                  /// send push notification to the user to let her know of cancellation
                  var cancellationNotificationMessage = "Reservation Cancelled\n" + businessName + " cancelled your following reservation\n";
                  
                  var bookingDate = bookingTicket.get("bookingTicketDate");
                  var dateOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric"};  
                  cancellationNotificationMessage = cancellationNotificationMessage + new Intl.DateTimeFormat("en-US", dateOptions).format(bookingDate) + "\n";
                  
                  var bookingStartTime = bookingTicket.get("bookingTicketStartTime");
                  var bookingFinishTime = bookingTicket.get("bookingTicketFinishTime");
                  var timeOptions = { hour: "2-digit", minute: "2-digit"};
                  cancellationNotificationMessage = cancellationNotificationMessage + new Intl.DateTimeFormat("en-US", timeOptions).format(bookingStartTime) + " to " + new Intl.DateTimeFormat("en-US", timeOptions).format(bookingFinishTime);
                  console.log(cancellationNotificationMessage);
                  sendNotification(clientId, cancellationNotificationMessage,
                    function (errorMessage, result) {
                      if (errorMessage)
                      response.error(result);
                    });
                  },
                  error: function(bookingTicket, error) {
                    // error is a Parse.Error with an error code and message.
                    response.error('Booking Ticket Error:', error);
                  }
              });
                
              },
              error: function(cancelledBooking, error) {
                // error is a Parse.Error with an error code and message.
                response.error('cancelled booking error:', error);
              }
            });
          }
        }
        
        bookingDay.set("bookingEventStatus", "bookingEventStatusDeactivated");
        bookingDay.save();
        
        response.success('successfully deactivated BookingDay:', object.get('objectId'));
      },
      error: function(error) {
        response.error('Error in deactivation booking day:', error);
      }
    });
  });


Parse.Cloud.define('reactivateSchedule', function(request, response) {
  var bookingDayId = request.params.bookingDayId;
  var bookingEventId = request.params.bookingEventId;

  var BookingDay = Parse.Object.extend("BookingDay");
  var query = new Parse.Query(BookingDay);
  query.equalTo('objectId', bookingDayId);
  query.include('bookingTickets');
  query.first({
    success: function(object) {
      // Successfully retrieved the object.
      var bookingDay = object;

      var bookingTickets = bookingDay.get("bookingTickets");
      for (var i = 0; i < bookingTickets.length; i++) {
        var bookingTicket = bookingTickets[i];
        bookingTicket.set("bookingEventStatus", "bookingEventStatusActive");
        bookingTicket.save();
      }

      bookingDay.set("bookingEventStatus", "bookingEventStatusActive");
      bookingDay.save();
      response.success('successfully activated BookingDay:', object.get('objectId'));
    },
    error: function(error) {
      response.error('Error in deactivation booking day:', error);
    }
  });
});

