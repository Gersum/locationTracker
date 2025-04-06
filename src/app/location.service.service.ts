import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private hubConnection!: signalR.HubConnection;

  public startConnection(): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5242/fleetHub') // Ensure this matches your backend URL
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('SignalR connection started'))
      .catch((err) => console.error('Error starting SignalR connection:', err));

    this.hubConnection.onclose(() => {
      console.error('SignalR connection closed');
    });
  }

  public onVehicleLocationReceived(callback: (vehicleId: string, latitude: number, longitude: number) => void): void {
    this.hubConnection.on('ReceiveVehicleLocation', (vehicleId, latitude, longitude) => {
      console.log(`Location received: ${vehicleId} - ${latitude}, ${longitude}`); // Debugging log
      callback(vehicleId, latitude, longitude);
    });
  }
}