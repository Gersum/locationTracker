import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import axios from 'axios';
import { LocationService } from '../location.service.service'; // Adjust the import path as necessary

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
})
export class MapComponent implements OnInit, OnDestroy {
  private map!: L.Map;
  private vehicleMarkers: Map<string, L.Marker> = new Map(); // Store markers by vehicle ID
  private simulationInterval: any; // Store the interval ID for simulation
  private routeCoordinates: L.LatLng[] = []; // Store the route coordinates
  private userMarker?: L.Marker; // Marker for the simulated vehicle

  constructor(private http: HttpClient, private signalRService: LocationService) {}

  ngOnInit(): void {
    this.initMap();

    // Fetch and simulate a real-world route
    this.fetchAndSimulateRoute();

    // Listen for location updates from the backend
    this.signalRService.startConnection();
    this.signalRService.onVehicleLocationReceived((vehicleId, latitude, longitude) => {
      console.log(`Location received: ${vehicleId} - ${latitude}, ${longitude}`); // Debugging log
      this.updateVehicleLocation(vehicleId, latitude, longitude);
    });
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval); // Ensure the interval is cleared on component destroy
    }
  }

  private initMap(): void {
    console.log('Initializing map...'); // Debugging log

    this.map = L.map('map', {
      center: [8.9806, 38.7578], // Default center
      zoom: 13, // Default zoom level
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    console.log('Map initialized');
  }

  private async fetchAndSimulateRoute(): Promise<void> {
    const startLatLng = L.latLng(8.9806, 38.7578); // Starting point
    const endLatLng = L.latLng(8.9906, 38.7678);   // Destination point

    // Fetch the route from OpenRouteService
    const route = await this.fetchRoute(startLatLng, endLatLng);

    if (!route || route.length === 0) {
      alert('Could not fetch a valid route. Please try again.');
      return;
    }

    // Draw the full route on the map (in blue)
    const routeLine = L.polyline(route, {
      color: 'blue',
      weight: 8,
      opacity: 0.7,
    }).addTo(this.map);

    // Center the map to fit the route
    const bounds = L.latLngBounds(route);
    this.map.fitBounds(bounds, { padding: [50, 50] });

    // Simulate vehicle movement along the route
    this.simulateVehicleMovement(route);
  }

  private async fetchRoute(start: L.LatLng, end: L.LatLng): Promise<L.LatLng[]> {
    const apiKey = '5b3ce3597851110001cf6248b88dd386796d4bdf9d80f414102cc7c3'; // Replace with your OpenRouteService API key
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;

    try {
      console.log('Fetching route from API:', url); // Debugging log
      const response = await axios.get(url);
      const coordinates = response.data.features[0].geometry.coordinates;

      // Convert coordinates to Leaflet LatLng format
      return coordinates.map((coord: [number, number]) => L.latLng(coord[1], coord[0]));
    } catch (error) {
      console.error('Error fetching route:', error);
      return [];
    }
  }

  private simulateVehicleMovement(route: L.LatLng[]): void {
    let currentIndex = 0;

    // Track our traveled coordinates (for the red path)
    const traveledPathCoordinates: L.LatLng[] = [route[0]];

    // Create the traveled path polyline in red
    const traveledPathLine = L.polyline(traveledPathCoordinates, {
      color: 'red',
      weight: 8,
      opacity: 0.9,
    }).addTo(this.map);

    // Initialize the vehicle marker at the starting point (if it doesn't exist)
    if (!this.userMarker) {
      this.userMarker = L.marker(route[0], {
        icon: L.icon({
          iconUrl: 'marker-icon.png', // Ensure this path is correct
          iconSize: [25, 41],
          iconAnchor: [12, 41],
        }),
        title: 'Simulated Vehicle',
      })
        .addTo(this.map)
        .bindPopup('Simulated Vehicle')
        .openPopup();
    }

    // Smoothly move the vehicle marker along the route
    this.simulationInterval = setInterval(() => {
      if (currentIndex >= route.length - 1) {
        clearInterval(this.simulationInterval);
        console.log('Vehicle movement simulation completed.');
        return;
      }

      currentIndex++;
      const currentLatLng = route[currentIndex];

      // Update the marker's position
      if (this.userMarker) {
        this.userMarker.setLatLng(currentLatLng);
      }

      // Add the current segment to the traveled path in red
      traveledPathCoordinates.push(currentLatLng);
      traveledPathLine.setLatLngs(traveledPathCoordinates);

      // Log the current position
      console.log(`Simulated vehicle location: Latitude: ${currentLatLng.lat}, Longitude: ${currentLatLng.lng}`);
    }, 1000); // Adjust the interval for smoother or faster movement
  }

  private updateVehicleLocation(vehicleId: string, latitude: number, longitude: number): void {
    console.log(`Updating marker for ${vehicleId} at ${latitude}, ${longitude}`); // Debugging log

    const newLatLng = L.latLng(latitude, longitude);

    if (this.vehicleMarkers.has(vehicleId)) {
      const marker = this.vehicleMarkers.get(vehicleId)!;

      // Smoothly move the marker
      marker.setLatLng(newLatLng);
    } else {
      // Create a new marker if it doesn't exist
      const marker = L.marker(newLatLng, {
        icon: L.icon({
          iconUrl: 'marker-icon.png', // Ensure this path is correct
          iconSize: [25, 41],
          iconAnchor: [12, 41],
        }),
      }).addTo(this.map);

      marker.bindPopup(`Vehicle: ${vehicleId}`);
      this.vehicleMarkers.set(vehicleId, marker);
      console.log(`Marker created for ${vehicleId}`);
    }
  }
}