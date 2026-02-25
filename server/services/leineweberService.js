const mongoose = require('mongoose');

class LeineweberService {
  constructor() {
    this.connection = null;
    this.FormModel = null;
    this.connected = false;
  }

  async connect() {
    const uri = process.env.LEINEWEBER_MONGODB_URI;
    if (!uri) {
      console.warn('[Leineweber] LEINEWEBER_MONGODB_URI not set — all lookups will return null');
      return;
    }

    try {
      this.connection = await mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 3
      }).asPromise();

      const formSchema = new mongoose.Schema({
        taskId: String, qualifiziert: Boolean,
        leadName: String, vorname: String, nachname: String,
        geburtsdatum: String, geburtsort: String, geschlecht: String,
        familienstand: String, phoneNumber: String,
        strasse: String, hausnummer: String, plz: String, wohnort: String,
        beschaeftigungsArt: String, derzeitigeTaetigkeit: String,
        erlernterBeruf: String, nettoEinkommen: String,
        selbststaendig: Boolean, befristet: Boolean, warSelbststaendig: Boolean,
        gesamtSchulden: String, glaeubiger: String,
        aktuelePfaendung: Boolean, schuldenartInfo: String, pKonto: Boolean,
        kinderAnzahl: String, kinderAlter: String, unterhaltspflicht: Boolean,
        immobilien: Boolean, fahrzeuge: Boolean,
        bausparvertrag: Boolean, lebensversicherung: Boolean,
        rentenversicherung: Boolean, sparbuch: Boolean, bankguthaben: Boolean,
      }, { strict: false, collection: 'forms' });

      this.FormModel = this.connection.model('Form', formSchema);
      this.connected = true;
      console.log('[Leineweber] Connected to Formular-Mitarbeiter database');
    } catch (err) {
      console.warn('[Leineweber] Failed to connect:', err.message);
      this.connected = false;
    }
  }

  async lookupQualifiedForm(firstName, lastName, geburtstag) {
    if (!this.connected || !this.FormModel) {
      return null;
    }

    try {
      const query = {
        qualifiziert: true,
        vorname: new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        nachname: new RegExp(`^${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      };

      if (geburtstag) {
        query.geburtsdatum = geburtstag;
      }

      const form = await this.FormModel.findOne(query).sort({ _id: -1 }).lean();
      return form || null;
    } catch (err) {
      console.warn('[Leineweber] Lookup failed:', err.message);
      return null;
    }
  }

  async getFullFormData(taskId) {
    if (!this.connected || !this.FormModel) return null;
    try {
      return await this.FormModel.findOne({ taskId }).lean() || null;
    } catch (err) {
      console.warn('[Leineweber] getFullFormData failed:', err.message);
      return null;
    }
  }

  async disconnect() {
    if (this.connection) {
      try {
        await this.connection.close();
        this.connected = false;
        console.log('[Leineweber] Disconnected');
      } catch (err) {
        console.warn('[Leineweber] Disconnect error:', err.message);
      }
    }
  }
}

module.exports = new LeineweberService();
