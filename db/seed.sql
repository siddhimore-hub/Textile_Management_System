INSERT INTO users (name,email,role) VALUES
 ('Owner','owner@everest.test','owner'),('Store Keeper','store@everest.test','store'),
 ('Supervisor','sup@everest.test','supervisor'),('QC Inspector','qc@everest.test','qc'),
 ('Sales','sales@everest.test','sales'),('Accounts','acc@everest.test','accounts');
INSERT INTO suppliers (name,phone) VALUES ('Coimbatore Yarn Co','9000000001'),('Tiruppur Spinners','9000000002');
INSERT INTO buyers (name,phone,email) VALUES ('Lakshmi Garments','9000000011','buy@lakshmi.test'),('Metro Apparel','9000000012','buy@metro.test');
INSERT INTO materials (name,yarn_type,colour,unit,reorder_level) VALUES
 ('Cotton 30s White','cotton_30s','white','kg',200),('Cotton 40s Blue','cotton_40s','blue','kg',150),('Poly Blend Black','poly_blend','black','kg',100);
INSERT INTO machines (name,stage,status) VALUES
 ('Spin-01','spinning','idle'),('Loom-01','weaving','idle'),('Loom-02','weaving','idle'),('Dye-01','dyeing','idle');
INSERT INTO workers (name,daily_wage) VALUES ('Ravi',650),('Meena',700),('Arun',600);
