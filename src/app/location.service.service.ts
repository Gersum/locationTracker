// src/app/services/location.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../Environment/environment';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private hubConnection!: signalR.HubConnection;
  public newLocation = new Subject<{vehicleId: string, lat: number, lng: number}>();

  constructor() { }

  public startConnection(): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/fleetHub`)
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('Connection started'))
      .catch(err => console.log('Error while starting connection: ' + err));

    this.hubConnection.on('ReceiveVehicleLocation', (vehicleId, lat, lng) => {
      this.newLocation.next({vehicleId, lat, lng});
    });
  }

  public stopConnection(): void {
    this.hubConnection?.stop();
  }

  public mockLocation(vehicleId: string): void {
    setInterval(() => {
      const lat = 51.505 + Math.random() * 0.01;
      const lng = -0.09 + Math.random() * 0.01;
      this.newLocation.next({vehicleId, lat, lng});
    }, 3000);
  }
}

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private hubConnection!: signalR.HubConnection;

  public startConnection(): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7100/fleetHub') // Replace with your backend URL
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('SignalR connection started'))
      .catch((err) => console.error('Error starting SignalR connection:', err));
  }

  public onVehicleLocationReceived(callback: (vehicleId: string, latitude: number, longitude: number) => void): void {
    this.hubConnection.on('ReceiveVehicleLocation', callback);
  }
}